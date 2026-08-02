"""Generic entity merge: repoint every reference from a loser onto a survivor.

Handles the three ways an entity id is referenced:
  1. hard FK columns (discovered generically from SQLAlchemy metadata),
  2. soft-polymorphic (entity_type, entity_id) links (hardcoded list; change_log
     is intentionally excluded — it's append-only and stores plural table names),
  3. `[@Label](type:uuid)` tokens inside note bodies (text replace).
Composite-PK join tables are de-duplicated before repointing to avoid unique
violations. Then the survivor's empty fields are filled from the loser and the
loser is deleted — all in one transaction.
"""

from typing import Any
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel
from sqlalchemy import delete, func, select, tuple_, update
from sqlalchemy.ext.asyncio import AsyncSession

from wild_life.db.base import Base
from wild_life.db.session import get_session
from wild_life.models import (
    Allergy,
    Area,
    Commitment,
    Decision,
    Delegation,
    InsurancePlan,
    Location,
    Medication,
    Metric,
    Moment,
    Organization,
    Outcome,
    Person,
    Program,
    Project,
    Protocol,
    Request,
    Resource,
    Review,
    Routine,
    Task,
)
from wild_life.schemas.common import EntityType

router = APIRouter(prefix="/merge", tags=["merge"])

# Singular EntityType string -> model class.
TYPE_TO_MODEL: dict[str, type[Any]] = {
    "person": Person,
    "organization": Organization,
    "location": Location,
    "area": Area,
    "program": Program,
    "project": Project,
    "task": Task,
    "routine": Routine,
    "outcome": Outcome,
    "metric": Metric,
    "commitment": Commitment,
    "request": Request,
    "delegation": Delegation,
    "review": Review,
    "resource": Resource,
    "decision": Decision,
    "medication": Medication,
    "protocol": Protocol,
    "insurance_plan": InsurancePlan,
    "allergy": Allergy,
}

# Catalog/identity types where a shared name means a likely duplicate (for the
# duplicates finder). Content types (note/task/event/resource/health_event)
# legitimately repeat titles, so they're excluded from auto-suggestion. Column
# holds the human label per type.
NAME_COL: dict[str, str] = {
    "person": "name",
    "organization": "name",
    "location": "name",
    "area": "name",
    "program": "name",
    "project": "name",
    "routine": "name",
    "outcome": "statement",
    "metric": "name",
    "medication": "name",
    "protocol": "name",
    "insurance_plan": "name",
    "allergy": "substance",
}

# Soft-poly (table, type_col, id_col) — NOT FKs. change_log deliberately omitted.
SOFT_POLY = [
    # Moments. Everything a merge has to carry now lives here: a moment's
    # subject, the people who were there, the place it happened, and what it
    # merely named are all one soft-poly edge. Its absence was a live defect —
    # merging two people repointed their commitments and left every moment they
    # were involved in pointing at the row that was about to be deleted.
    (Base.metadata.tables["wild_life.moment_links"], "entity_type", "entity_id"),
    (Commitment.__table__, "entity_type", "entity_id"),
    (Request.__table__, "entity_type", "entity_id"),
    (Delegation.__table__, "entity_type", "entity_id"),
    (Resource.__table__, "entity_type", "entity_id"),
    (Decision.__table__, "entity_type", "entity_id"),
    # An outcome's root is soft-poly like the rest, so a merge has to carry it —
    # otherwise combining two rows silently drops what they claimed must be true.
    (Outcome.__table__, "entity_type", "entity_id"),
    # Same for what a metric measures, since it stopped being an FK triple.
    (Metric.__table__, "entity_type", "entity_id"),
    (
        Base.metadata.tables["wild_life.entity_links"],
        "target_type",
        "target_id",
    ),
    (
        Base.metadata.tables["wild_life.entity_links"],
        "source_type",
        "source_id",
    ),
]

SKIP_FIELDS = {"id", "created_at", "updated_at"}
# Prose the survivor should end up with both halves of, rather than whichever
# side happened to be non-empty. Named explicitly: a column called `notes` used
# to stand in for "this is prose", and no column is called that any more.
APPEND_FIELDS = {
    "purpose",
    "description",
    "adjustments",
    "rationale",
    "scale",
    "context",
    "reaction",
    "instructions",
}


def _fk_sites(target_table: Any) -> list[tuple[Any, Any]]:
    """Every (table, column) with a FK pointing at target_table."""
    sites = []
    for tbl in Base.metadata.tables.values():
        for fk in tbl.foreign_keys:
            if fk.column.table is target_table:
                sites.append((tbl, fk.parent))
    return sites


async def _count(
    session: AsyncSession, table: Any, col: Any, loser: UUID, extra
) -> int:
    stmt = select(func.count()).select_from(table).where(col == loser, *extra)
    return int((await session.execute(stmt)).scalar_one())


async def _repoint(session, table, col, loser: UUID, survivor: UUID, extra) -> int:
    """De-dup (for composite-PK tables) then repoint col loser->survivor. Returns rows moved."""
    n = await _count(session, table, col, loser, extra)
    if n == 0:
        return 0
    pk = list(table.primary_key.columns)
    if col.name in {c.name for c in pk} and len(pk) > 1:
        others = [c for c in pk if c.name != col.name]
        surv = select(*others).where(col == survivor, *extra)
        await session.execute(
            delete(table).where(col == loser, *extra, tuple_(*others).in_(surv))
        )
    await session.execute(
        update(table).where(col == loser, *extra).values({col.name: survivor})
    )
    return n


class MergeRequest(BaseModel):
    type: EntityType
    survivor_id: UUID
    loser_id: UUID
    fill_fields: bool = True


def _model_for(type_: str) -> type[Any]:
    model = TYPE_TO_MODEL.get(type_)
    if model is None:
        raise HTTPException(
            status.HTTP_400_BAD_REQUEST, detail=f"Cannot merge type {type_!r}"
        )
    return model


async def _sites(model: type[Any]) -> tuple[list, list]:
    target = model.__table__
    fk = _fk_sites(target)  # [(table, col)]
    soft = [(t, t.c[tc], t.c[ic]) for (t, tc, ic) in SOFT_POLY]
    return fk, soft


@router.post("/preview", operation_id="merge_preview")
async def merge_preview(
    req: MergeRequest, session: AsyncSession = Depends(get_session)
) -> dict:
    """Count references that a merge would repoint, without mutating anything."""
    model = _model_for(req.type)
    if req.survivor_id == req.loser_id:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, detail="Same entity")
    counts: dict[str, int] = {}
    total = 0
    fk, soft = await _sites(model)
    for tbl, col in fk:
        c = await _count(session, tbl, col, req.loser_id, [])
        if c:
            counts[f"{tbl.name}.{col.name}"] = c
            total += c
    for tbl, tcol, icol in soft:
        c = await _count(session, tbl, icol, req.loser_id, [tcol == req.type])
        if c:
            counts[f"{tbl.name}.{icol.name}"] = c
            total += c
    body_tok = f"{req.type}:{req.loser_id}"
    nb = int(
        (
            await session.execute(
                select(func.count())
                .select_from(Moment.__table__)
                .where(Moment.__table__.c.body.like(f"%{body_tok}%"))
            )
        ).scalar_one()
    )
    return {"total_references": total, "by_site": counts, "note_bodies": nb}


@router.post("", operation_id="merge_entities")
async def merge_entities(
    req: MergeRequest, session: AsyncSession = Depends(get_session)
) -> dict:
    """Merge loser into survivor: repoint all references, fill fields, delete loser."""
    model = _model_for(req.type)
    if req.survivor_id == req.loser_id:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, detail="Same entity")
    survivor = await session.get(model, req.survivor_id)
    loser = await session.get(model, req.loser_id)
    if survivor is None or loser is None:
        raise HTTPException(
            status.HTTP_404_NOT_FOUND, detail="Survivor or loser not found"
        )

    repointed: dict[str, int] = {}
    fk, soft = await _sites(model)
    for tbl, col in fk:
        moved = await _repoint(session, tbl, col, req.loser_id, req.survivor_id, [])
        if moved:
            repointed[f"{tbl.name}.{col.name}"] = moved
    for tbl, tcol, icol in soft:
        moved = await _repoint(
            session, tbl, icol, req.loser_id, req.survivor_id, [tcol == req.type]
        )
        if moved:
            repointed[f"{tbl.name}.{icol.name}"] = moved

    # Mention tokens inside prose: `type:loser` -> `type:survivor`. A mention is
    # stored twice on purpose — as a link, and as a markdown target inside the
    # body — so repointing the link alone leaves the sentence pointing at a
    # person who no longer exists.
    old, new = f"{req.type}:{req.loser_id}", f"{req.type}:{req.survivor_id}"
    body_res = await session.execute(
        update(Moment.__table__)
        .where(Moment.__table__.c.body.like(f"%{old}%"))
        .values(body=func.replace(Moment.__table__.c.body, old, new))
    )
    note_bodies = body_res.rowcount or 0

    # field merge: fill survivor blanks from loser, and append rather than
    # discard where both sides hold prose — losing half of what someone wrote is
    # worse than a duplicated paragraph they can edit down.
    if req.fill_fields:
        for c in model.__table__.columns:
            if c.name in SKIP_FIELDS:
                continue
            if c.name in APPEND_FIELDS:
                sv, lv = getattr(survivor, c.name, None), getattr(loser, c.name, None)
                if lv:
                    setattr(survivor, c.name, f"{sv}\n\n{lv}" if sv else lv)
                continue
            cur = getattr(survivor, c.name, None)
            if cur is None or cur == "" or cur == [] or cur == {}:
                lv = getattr(loser, c.name, None)
                if lv not in (None, "", [], {}):
                    setattr(survivor, c.name, lv)

    await session.flush()
    await session.delete(loser)
    await session.flush()

    return {
        "survivor_id": str(req.survivor_id),
        "deleted": str(req.loser_id),
        "repointed": repointed,
        "note_bodies": note_bodies,
    }


@router.get("/duplicates", operation_id="merge_duplicates")
async def duplicates(
    type: EntityType | None = None, session: AsyncSession = Depends(get_session)
) -> list[dict]:
    """Groups of entities that share a normalized name, per type (candidates to merge)."""

    def normkey(s: str) -> str:
        return "".join(ch for ch in (s or "").lower() if ch.isalnum())

    types = [type] if type else list(NAME_COL.keys())
    out = []
    for t in types:
        model = TYPE_TO_MODEL.get(t)
        col = NAME_COL.get(t)
        if model is None or col is None:
            continue
        rows = (
            await session.execute(select(model.__table__.c.id, model.__table__.c[col]))
        ).all()
        groups: dict[str, list] = {}
        for rid, name in rows:
            if not name:
                continue
            groups.setdefault(normkey(name), []).append({"id": str(rid), "name": name})
        for members in groups.values():
            if len(members) > 1:
                out.append({"type": t, "members": members})
    return out
