"""Generic, expressive query layer for list endpoints.

Parses ``field__op=value`` query params against a model's real columns and applies
filters / full-text (``q=``) / tag / sort to a SQLAlchemy Select. Also holds the
per-entity searchable-text registry used by ``q=`` and the global ``/search``.

Design: unknown params are ignored (so bespoke per-endpoint params coexist), and
nothing is applied when no query params are present — existing full-list behaviour
is unchanged.
"""

from __future__ import annotations

import uuid as uuidmod
from collections.abc import Mapping
from datetime import date, datetime
from typing import Any

from fastapi import HTTPException, status
from sqlalchemy import (
    Boolean,
    Date,
    DateTime,
    Float,
    Integer,
    Numeric,
    String,
    Text,
    and_,
    or_,
)
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.sql import Select

from wild_life.models import (
    Allergy,
    Area,
    Commitment,
    Decision,
    Delegation,
    Event,
    InsurancePlan,
    Location,
    Medication,
    Metric,
    Note,
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

# Singular EntityType string -> model.
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
    "event": Event,
    "note": Note,
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
MODEL_TO_TYPE: dict[type[Any], str] = {m: t for t, m in TYPE_TO_MODEL.items()}

# Per type: (label column, curated text columns searched by ``q=`` / global search).
# Curated on purpose — opaque fields (patient_id, rx_bin, …) are excluded.
SEARCH_FIELDS: dict[str, tuple[str, list[str]]] = {
    "person": (
        "name",
        ["name", "nickname", "relationship", "role", "job_title", "specialty"],
    ),
    "organization": ("name", ["name", "org_type", "industry", "description"]),
    "location": (
        "name",
        [
            "name",
            "street",
            "unit",
            "city",
            "region",
            "postcode",
            "country",
            "description",
        ],
    ),
    "area": ("name", ["name", "purpose"]),
    "program": ("name", ["name", "purpose"]),
    "project": ("name", ["name", "purpose", "next_action"]),
    "task": ("title", ["title", "description"]),
    "routine": ("name", ["name", "frequency", "tracking_method", "rationale"]),
    "outcome": ("statement", ["statement", "description"]),
    "metric": ("name", ["name", "unit", "data_source", "scale"]),
    "event": ("title", ["title", "description", "location"]),
    "note": ("title", ["title", "body", "mood"]),
    "medication": ("name", ["name", "brand", "reason", "instructions", "adjustments"]),
    "protocol": ("name", ["name", "category", "purpose", "adjustments"]),
    "insurance_plan": ("name", ["name", "network", "member_id"]),
    "allergy": ("substance", ["substance", "reaction"]),
    "commitment": ("description", ["description", "evidence"]),
    "request": (
        "subject",
        [
            "subject",
            "body",
            "external_label",
            "next_action",
            "last_communication",
        ],
    ),
    "delegation": (
        "requested_outcome",
        ["requested_outcome", "instructions", "latest_update"],
    ),
    "decision": (
        "question",
        ["question", "options_considered", "decision", "rationale", "assumptions"],
    ),
    "resource": ("title", ["title", "resource_type", "url", "description"]),
    "review": (
        "review_type",
        ["observations", "decisions", "risks", "follow_up_actions"],
    ),
}

_OPS = {
    "eq",
    "ne",
    "in",
    "nin",
    "gt",
    "gte",
    "lt",
    "lte",
    "between",
    "isnull",
    "contains",
    "startswith",
}
_RESERVED = {"q", "sort", "limit", "offset"}


def _coerce(col: Any, val: str) -> Any:
    t = col.type
    try:
        if isinstance(t, UUID):
            return uuidmod.UUID(val)
        if isinstance(t, DateTime):
            return datetime.fromisoformat(val)
        if isinstance(t, Date):
            return date.fromisoformat(val)
        if isinstance(t, Integer):
            return int(val)
        if isinstance(t, (Float, Numeric)):
            return float(val)
        if isinstance(t, Boolean):
            return val.lower() in {"true", "1", "yes", "on"}
        return val
    except (ValueError, TypeError) as e:
        raise HTTPException(
            status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail=f"Bad value for {col.name}: {val!r}",
        ) from e


def _int(val: str, lo: int, hi: int | None) -> int:
    try:
        n = int(val)
    except ValueError as e:
        raise HTTPException(
            status.HTTP_422_UNPROCESSABLE_ENTITY, detail="Bad int"
        ) from e
    n = max(lo, n)
    if hi is not None:
        n = min(hi, n)
    return n


def _clause(col: Any, op: str, raw: str) -> Any:
    if op == "isnull":
        return col.is_(None) if raw.lower() in {"true", "1", "yes"} else col.isnot(None)
    if op in ("in", "nin"):
        vals = [_coerce(col, v) for v in raw.split(",") if v != ""]
        return col.in_(vals) if op == "in" else col.notin_(vals)
    if op == "between":
        parts = raw.split(",", 1)
        a, b = parts[0], (parts[1] if len(parts) > 1 else "")
        return col.between(_coerce(col, a), _coerce(col, b))
    if op == "contains":
        return col.ilike(f"%{raw}%")
    if op == "startswith":
        return col.ilike(f"{raw}%")
    v = _coerce(col, raw)
    # SQLAlchemy forbids ==/!= against a boolean/None singleton — use IS / IS NOT.
    if op in ("eq", "ne") and (v is None or isinstance(v, bool)):
        return col.is_(v) if op == "eq" else col.isnot(v)
    return {
        "eq": col == v,
        "ne": col != v,
        "gt": col > v,
        "gte": col >= v,
        "lt": col < v,
        "lte": col <= v,
    }[op]


def q_clause(model: type[Any], q: str) -> Any | None:
    """OR-ILIKE over a model's registered (or fallback text) columns."""
    cols = model.__table__.columns
    type_ = MODEL_TO_TYPE.get(model)
    names = SEARCH_FIELDS.get(type_, (None, []))[1] if type_ else []
    if not names:
        names = [c.name for c in cols if isinstance(c.type, (String, Text))]
    ors = [cols[n].ilike(f"%{q}%") for n in names if n in cols]
    return or_(*ors) if ors else None


def apply_query(
    stmt: Select,
    model: type[Any],
    params: Mapping[str, str],
    handled: frozenset[str] = frozenset(),
) -> tuple[Select, int | None, int | None]:
    """Apply field filters / q / tag / sort. Returns (stmt, limit, offset);
    limit/offset are parsed but NOT applied so the caller can also count.

    ``handled`` names params the caller has already turned into a clause of its
    own. Without it a route that widens a filter — ``?area_id=`` on tasks, which
    reaches through the area's programs and projects — would have its clause
    ANDed with the plain column match this applies, and the two together answer
    with only the rows filed at that exact level.
    """
    cols = model.__table__.columns
    clauses: list[Any] = []
    sort = None
    limit = offset = None

    for key, raw in params.items():
        if key in handled:
            continue
        if key == "sort":
            sort = raw
            continue
        if key == "limit":
            limit = _int(raw, 1, 500)
            continue
        if key == "offset":
            offset = _int(raw, 0, None)
            continue
        if key in _RESERVED:
            continue
        field, _, op = key.partition("__")
        col = cols.get(field)
        if col is None:
            continue  # unknown / bespoke param -> ignore
        op = op or "eq"
        if op not in _OPS:
            continue
        clauses.append(_clause(col, op, raw))

    q = params.get("q")
    if q:
        c = q_clause(model, q)
        if c is not None:
            clauses.append(c)

    if "tags" in cols:
        if params.get("tag"):
            clauses.append(cols["tags"].contains([params["tag"]]))
        if params.get("tag__all"):
            clauses.append(cols["tags"].contains(params["tag__all"].split(",")))
        if params.get("tag__any"):
            clauses.append(
                or_(
                    *[cols["tags"].contains([v]) for v in params["tag__any"].split(",")]
                )
            )

    if clauses:
        stmt = stmt.where(and_(*clauses))

    if sort:
        stmt = stmt.order_by(None)
        for part in sort.split(","):
            part = part.strip()
            desc = part.startswith("-")
            name = part[1:] if desc else part
            col = cols.get(name)
            if col is not None:
                stmt = stmt.order_by(col.desc() if desc else col.asc())

    return stmt, limit, offset
