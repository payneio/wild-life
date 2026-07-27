"""Mark a location whose fence moved, so the tick can re-derive its history.

A ``before_flush`` listener rather than logic in the PATCH handler, for the same
reason ``audit.py`` hooks the unit of work: it then holds for every write path —
the generic CRUD router, a promoted place candidate, a one-off script — instead of
only the one endpoint someone remembered to change.

Re-derivation is *marked* here and *done* by the tick, deliberately. The detail view
autosaves on every keystroke, so dragging a radius slider fires a stream of PATCHes;
re-deriving years of visits inside any one of them would be a disaster.

Importing this module registers the listener; ``db.session`` does so once.
"""

from datetime import datetime, timezone
from typing import Any

from sqlalchemy import event, inspect
from sqlalchemy.orm import Session

from wild_life.models.locations import Location

# Changing any of these changes which pings fall inside, so the derived visits for
# that location are no longer trustworthy.
_FENCE_ATTRS = ("latitude", "longitude", "radius_m")


def _fence_moved(obj: Location) -> bool:
    state = inspect(obj)
    return any(state.attrs[attr].history.has_changes() for attr in _FENCE_ATTRS)


@event.listens_for(Session, "before_flush")
def _mark_dirty_fences(session: Session, flush_context: Any, instances: Any) -> None:
    """Stamp ``geo_dirty_at`` on locations whose fence was created or moved."""
    moved = [
        obj
        for obj in (*session.new, *session.dirty)
        if isinstance(obj, Location) and _fence_moved(obj)
    ]
    # Set after collecting, so we never mutate while walking the session's sets.
    now = datetime.now(timezone.utc)
    for obj in moved:
        obj.geo_dirty_at = now
