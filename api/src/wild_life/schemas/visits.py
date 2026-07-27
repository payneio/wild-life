"""Schemas for derived location visits.

Read-only for now, and that is a statement rather than an omission: a visit is
derived from pings, so the API offering to create one would be offering to create
something the next tick would overwrite. The ``source`` column exists so that
hand-entered visits ("I was at Mom's, my phone was dead") can be added later
without the derivation trampling them.
"""

import uuid
from datetime import datetime

from pydantic import BaseModel

from wild_life.schemas.common import Entity


class LocationVisitRead(Entity):
    location_id: uuid.UUID
    entered_at: datetime
    # Null means you are inside right now.
    exited_at: datetime | None
    last_seen_inside_at: datetime
    ping_count: int
    # exit | stale | rebuild. `stale` means the visit was closed because the fixes
    # stopped, not because a departure was observed — so the end time is a lower
    # bound, and the UI should render it as uncertain.
    close_reason: str | None
    source: str


class VisitWithLocation(BaseModel):
    """A visit plus the fence that produced it, for "where was I" answers."""

    location_id: uuid.UUID
    name: str
    category: str | None
    radius_m: float
    entered_at: datetime
    exited_at: datetime | None
    visit_id: uuid.UUID


class Presence(BaseModel):
    """Everywhere you were at one instant, innermost first.

    A list rather than a single place, because fences nest: at 14:03 you were in
    Washington *and* Seattle *and* Capitol Hill *and* the office. ``places[0]`` is
    the most specific answer and the tail is the breadcrumb; collapsing that to one
    value would throw away the part that makes the model worth having.
    """

    at: datetime
    places: list[VisitWithLocation]
