"""Automatic change tracking.

A single ``before_flush`` listener on the SQLAlchemy ``Session`` records every
insert/update/delete of a domain entity into ``change_log``. Because it hooks the
unit of work rather than individual endpoints, it captures changes no matter which
router (or bulk operation) produced them.

A model opts out with ``__audit__ = False`` (see :func:`_audited`). That is for
tables whose rows are observations rather than entities — high-volume, append-only,
and of no interest to the history view or the live stream. Note the escape is at the
*unit of work*: a Core ``insert()``/``update()`` statement never reaches this
listener at all, which is how an audited table can still take silent high-frequency
writes to a few bookkeeping columns.

Importing this module registers the listener; ``db.session`` does so once.
"""

import uuid
from datetime import date, datetime
from decimal import Decimal
from typing import Any

from sqlalchemy import event, inspect
from sqlalchemy.orm import Session

from wild_life.models.history import ChangeLog

# Attributes tried, in order, to build a human-readable label for an entity.
_LABEL_ATTRS = (
    "name",
    "title",
    "description",
    "expected_result",
    "requested_outcome",
    "question",
    "summary",
    "substance",
    "activity",
    "review_type",
)
_LABEL_MAX = 140


def _jsonable(value: Any) -> Any:
    """Coerce a column value into something JSON/JSONB can store."""
    if value is None or isinstance(value, (str, int, float, bool)):
        return value
    if isinstance(value, uuid.UUID):
        return str(value)
    if isinstance(value, (datetime, date)):
        return value.isoformat()
    if isinstance(value, Decimal):
        return float(value)
    if isinstance(value, (list, tuple, set)):
        return [_jsonable(v) for v in value]
    if isinstance(value, dict):
        return {str(k): _jsonable(v) for k, v in value.items()}
    return str(value)


def _label(obj: Any) -> str | None:
    for attr in _LABEL_ATTRS:
        val = getattr(obj, attr, None)
        if isinstance(val, str) and val.strip():
            return val.strip()[:_LABEL_MAX]
    return None


def _snapshot(obj: Any) -> dict[str, Any]:
    """Every mapped column's current value."""
    state = inspect(obj)
    return {
        attr.key: _jsonable(getattr(obj, attr.key))
        for attr in state.mapper.column_attrs
    }


def _diff(obj: Any) -> dict[str, dict[str, Any]]:
    """Per-column ``{old, new}`` for attributes that actually changed."""
    state = inspect(obj)
    changes: dict[str, dict[str, Any]] = {}
    for attr in state.mapper.column_attrs:
        hist = state.attrs[attr.key].history
        if not hist.has_changes():
            continue
        old = hist.deleted[0] if hist.deleted else None
        new = hist.added[0] if hist.added else None
        changes[attr.key] = {"old": _jsonable(old), "new": _jsonable(new)}
    return changes


def _log_for(obj: Any, action: str, changes: dict[str, Any]) -> ChangeLog:
    return ChangeLog(
        entity_type=obj.__tablename__,
        entity_id=getattr(obj, "id", None),
        entity_label=_label(obj),
        action=action,
        changes=changes,
    )


def _audited(obj: Any) -> bool:
    """Whether a flushed object should produce a ``change_log`` row.

    Opt out with ``__audit__ = False`` on the model. The one current user is
    ``LocationPing``: raw, high-volume, append-only observation data whose per-row
    snapshot would cost more storage than the pings themselves, and which would
    ``pg_notify`` every open SSE stream at device ping rate.
    """
    return not isinstance(obj, ChangeLog) and getattr(obj, "__audit__", True)


@event.listens_for(Session, "before_flush")
def _record_changes(session: Session, flush_context: Any, instances: Any) -> None:
    """Stage a ChangeLog row for each pending create/update/delete."""
    pending: list[ChangeLog] = []

    for obj in session.new:
        # Must precede the id assignment below: an exempt model is free to use a
        # non-UUID primary key, and stamping a uuid4 into it would corrupt it.
        if not _audited(obj):
            continue
        # PKs are server-generated (gen_random_uuid); assign now so the audit
        # row can reference the id without waiting for the INSERT to return it.
        if getattr(obj, "id", None) is None and hasattr(obj, "id"):
            obj.id = uuid.uuid4()
        pending.append(_log_for(obj, "insert", _snapshot(obj)))

    for obj in session.dirty:
        if not _audited(obj):
            continue
        changes = _diff(obj)
        if not changes:  # dirtied but no real column change
            continue
        pending.append(_log_for(obj, "update", changes))

    for obj in session.deleted:
        if not _audited(obj):
            continue
        pending.append(_log_for(obj, "delete", _snapshot(obj)))

    # Add after iterating so we don't mutate session.new mid-iteration.
    for entry in pending:
        session.add(entry)
