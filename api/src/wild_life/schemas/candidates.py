"""Schemas for place candidates — the system's proposals.

Read, promote, dismiss. There is no create: a candidate is derived from the
reading log, and one you typed would be a Location with extra steps.
"""

import uuid
from datetime import datetime

from pydantic import BaseModel, Field

from wild_life.schemas.common import Entity
from wild_life.schemas.locations import LocationCategory, LocationRead


class PlaceCandidateRead(Entity):
    centroid_lat: float
    centroid_lon: float
    radius_m: float
    stop_count: int
    total_seconds: int
    first_seen_at: datetime
    last_seen_at: datetime
    dismissed_at: datetime | None
    promoted_location_id: uuid.UUID | None
    label_hint: str | None


class PromoteRequest(BaseModel):
    """Overrides for the promoted Location. Everything is optional — the point is
    that the reverse-geocode fills these in and you correct what it got wrong."""

    name: str | None = None
    category: LocationCategory | None = None
    # Floored below, because a fence smaller than the spread of the stops that
    # produced it would fail to match the very readings that proposed it.
    radius_m: float | None = Field(None, ge=10, le=200_000)


class Identification(BaseModel):
    """What is at a candidate's coordinates, looked up on request.

    Separate from promoting, because you cannot sensibly decide to name a place
    before anything has told you what it is. Still explicit — the coordinate
    leaves the box when you ask this question and at no other time.
    """

    display_name: str | None
    name: str | None
    street: str | None
    city: str | None
    region: str | None
    postcode: str | None
    country: str | None


class PromoteResult(BaseModel):
    location: LocationRead
    # How much history the new fence explained. The number that makes promoting
    # feel like uncovering something rather than filing a form.
    visits: int
    geocoded: bool
