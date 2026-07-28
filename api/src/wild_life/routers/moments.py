"""Routes for moments — one timeline, queried from whichever end you hold.

The list endpoint is the whole point: **the timeline of X is the moments linked
to X**, so a program's band, a person's history, a medication's dose log and "what
happened while I was at the clinic" are one query with different arguments,
rather than eight hand-written projections.
"""

from collections import defaultdict
from datetime import UTC, datetime, timedelta
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, Request, status
from sqlalchemy import delete, func, or_, select
from sqlalchemy.ext.asyncio import AsyncSession
from starlette.concurrency import run_in_threadpool

from wild_life.backfill_moments import run as backfill
from wild_life.config import settings
from wild_life.db.session import get_session
from wild_life.models.moments import Moment, MomentLink
from wild_life.query import apply_query
from wild_life.schemas.common import EntityType, MomentKind, MomentRole
from wild_life.schemas.moments import (
    MomentCreate,
    MomentLinkRef,
    MomentRead,
    MomentUpdate,
)

router = APIRouter(prefix="/moments", tags=["moments"])

# Where a moment sits in time: what happened, or failing that where it is meant
# to. One expression, because a timeline shows both and a planned lunch has no
# occurrence to sort by.
_WHEN = func.coalesce(Moment.started_at, Moment.window_start)


def _is_self(link: MomentLinkRef) -> bool:
    """Whether a link points at the frame rather than at something inside it."""
    return (
        link.entity_type == "person"
        and settings.self_person_id is not None
        and link.entity_id == settings.self_person_id
    )


async def _reconcile_links(
    session: AsyncSession, moment_id: UUID, links: list[MomentLinkRef]
) -> None:
    """Replace a moment's links with exactly ``links`` (deduped, self dropped).

    Self links are dropped here rather than rejected, because the composer sends
    what the prose says and the prose may well mention its own author. 325
    attendee edges and 15 journal mentions pointed at Paul before the backfill,
    all of them asserting that the writer was present at his own life. Keeping
    them would crowd out the link that carries information: who *else*.
    """
    await session.execute(delete(MomentLink).where(MomentLink.moment_id == moment_id))
    seen: set[tuple[str, str, UUID]] = set()
    for link in links:
        if _is_self(link):
            continue
        key = (link.role, link.entity_type, link.entity_id)
        if key in seen:
            continue
        seen.add(key)
        session.add(
            MomentLink(
                moment_id=moment_id,
                role=link.role,
                entity_type=link.entity_type,
                entity_id=link.entity_id,
            )
        )
    await session.flush()


async def _links_for(
    session: AsyncSession, moment_ids: list[UUID]
) -> dict[UUID, list[MomentLinkRef]]:
    out: dict[UUID, list[MomentLinkRef]] = defaultdict(list)
    if not moment_ids:
        return out
    result = await session.execute(
        select(MomentLink).where(MomentLink.moment_id.in_(moment_ids))
    )
    for link in result.scalars():
        out[link.moment_id].append(
            MomentLinkRef(
                role=link.role,
                entity_type=link.entity_type,
                entity_id=link.entity_id,
            )
        )
    return out


def _read(moment: Moment, links: list[MomentLinkRef]) -> MomentRead:
    read = MomentRead.model_validate(moment)
    read.links = links
    return read


@router.post(
    "",
    response_model=MomentRead,
    status_code=status.HTTP_201_CREATED,
    operation_id="moments_create",
)
async def create_moment(
    payload: MomentCreate, session: AsyncSession = Depends(get_session)
) -> MomentRead:
    moment = Moment(**payload.model_dump(exclude={"links"}))
    session.add(moment)
    await session.flush()
    await _reconcile_links(session, moment.id, payload.links)
    await session.refresh(moment)
    links = await _links_for(session, [moment.id])
    return _read(moment, links[moment.id])


@router.get("", response_model=list[MomentRead], operation_id="moments_list")
async def list_moments(
    request: Request,
    session: AsyncSession = Depends(get_session),
    kind: MomentKind | None = None,
    linked_type: EntityType | None = None,
    linked_id: UUID | None = None,
    role: MomentRole | None = None,
    since: datetime | None = None,
    until: datetime | None = None,
    unfulfilled: bool | None = None,
) -> list[MomentRead]:
    """Moments, newest first.

    ``linked_type``/``linked_id`` is the timeline of a thing; add ``role`` to ask
    a narrower question ("moments *with* Melissa" rather than "moments involving
    her at all"). ``unfulfilled`` is the derived lapse — a window that has passed
    with nothing having happened in it and no decision to drop it — which is a
    query rather than a stored state precisely so it can never go stale.
    """
    stmt = select(Moment)
    if kind is not None:
        stmt = stmt.where(Moment.kind == kind)
    if linked_type is not None and linked_id is not None:
        edge = select(MomentLink.moment_id).where(
            MomentLink.entity_type == linked_type,
            MomentLink.entity_id == linked_id,
        )
        if role is not None:
            edge = edge.where(MomentLink.role == role)
        stmt = stmt.where(Moment.id.in_(edge))
    if since is not None:
        stmt = stmt.where(or_(Moment.started_at >= since, Moment.window_end >= since))
    if until is not None:
        stmt = stmt.where(or_(Moment.started_at <= until, Moment.window_start <= until))
    if unfulfilled:
        stmt = stmt.where(
            Moment.window_end < func.now(),
            Moment.started_at.is_(None),
            Moment.withdrawn_at.is_(None),
        )
    stmt = stmt.order_by(_WHEN.desc().nullslast(), Moment.created_at.desc())
    stmt, limit, offset = apply_query(stmt, Moment, request.query_params)
    if offset is not None:
        stmt = stmt.offset(offset)
    stmt = stmt.limit(limit if limit is not None else 200)
    result = await session.execute(stmt)
    moments = list(result.scalars().all())
    links = await _links_for(session, [m.id for m in moments])
    return [_read(m, links[m.id]) for m in moments]


@router.get("/{item_id}", response_model=MomentRead, operation_id="moments_get")
async def get_moment(
    item_id: UUID, session: AsyncSession = Depends(get_session)
) -> MomentRead:
    moment = await session.get(Moment, item_id)
    if moment is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, detail="Not found")
    links = await _links_for(session, [moment.id])
    return _read(moment, links[moment.id])


@router.patch("/{item_id}", response_model=MomentRead, operation_id="moments_update")
async def update_moment(
    item_id: UUID, payload: MomentUpdate, session: AsyncSession = Depends(get_session)
) -> MomentRead:
    moment = await session.get(Moment, item_id)
    if moment is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, detail="Not found")
    data = payload.model_dump(exclude_unset=True, exclude={"links"})
    for field, value in data.items():
        setattr(moment, field, value)
    if "links" in payload.model_fields_set:
        await _reconcile_links(session, moment.id, payload.links or [])
    await session.flush()
    await session.refresh(moment)
    links = await _links_for(session, [moment.id])
    return _read(moment, links[moment.id])


@router.delete(
    "/{item_id}",
    status_code=status.HTTP_204_NO_CONTENT,
    operation_id="moments_delete",
)
async def delete_moment(
    item_id: UUID, session: AsyncSession = Depends(get_session)
) -> None:
    moment = await session.get(Moment, item_id)
    if moment is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, detail="Not found")
    await session.delete(moment)


@router.post("/sync", operation_id="moments_sync")
async def sync(full: bool = False, hours: float = 2.0) -> dict[str, int]:
    """Mirror the tables that still write their own rows into the spine.

    Doses, readings and task completions are authored through their own surfaces
    and land in `routine_instances`, `metric_entries` and `tasks`. Until those
    surfaces move too, a moment for them exists only because this ran — so a dose
    logged at noon would otherwise be missing from the timeline until someone
    remembered to backfill.

    Same shape as `locations/tick`, and for the same reason its docstring gives:
    a rolling replay is what lets the live path stay simple. The window is
    generous rather than exact, because re-upserting a handful of rows is free
    and a stored high-water mark is a thing that can be wrong.

    `full=true` re-reads everything; that belongs nightly rather than every few
    minutes.
    """
    since = None if full else datetime.now(UTC) - timedelta(hours=hours)
    # The backfill is synchronous (it is also a CLI), so it runs off the event
    # loop rather than blocking every other request for the length of a scan.
    return await run_in_threadpool(backfill, dry_run=False, since=since)
