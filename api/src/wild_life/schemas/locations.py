"""Schemas for Location."""

from datetime import datetime
from typing import Annotated, Literal

from pydantic import BaseModel, Field

from wild_life.schemas.common import Entity

LocationCategory = Literal["home", "work", "venue", "city", "other"]

# Bounds are load-bearing, not decoration. Without an upper bound on the radius a
# single mistyped digit makes every ping fall inside every fence, and the visit
# table explodes before anyone notices.
Latitude = Annotated[float, Field(ge=-90, le=90)]
Longitude = Annotated[float, Field(ge=-180, le=180)]
RadiusM = Annotated[float, Field(ge=10, le=200_000)]


class LocationCreate(BaseModel):
    name: str
    category: LocationCategory | None = None
    street: str | None = None
    unit: str | None = None
    city: str | None = None
    region: str | None = None
    postcode: str | None = None
    country: str | None = None
    description: str | None = None
    latitude: Latitude | None = None
    longitude: Longitude | None = None
    radius_m: RadiusM = 150


class LocationUpdate(BaseModel):
    name: str | None = None
    category: LocationCategory | None = None
    street: str | None = None
    unit: str | None = None
    city: str | None = None
    region: str | None = None
    postcode: str | None = None
    country: str | None = None
    description: str | None = None
    latitude: Latitude | None = None
    longitude: Longitude | None = None
    radius_m: RadiusM | None = None


class LocationRead(Entity):
    name: str
    category: LocationCategory | None
    street: str | None
    unit: str | None
    city: str | None
    region: str | None
    postcode: str | None
    country: str | None
    description: str | None
    latitude: float | None
    longitude: float | None
    radius_m: float
    geo_dirty_at: datetime | None
