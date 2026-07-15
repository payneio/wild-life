"""Schemas for Location."""

from typing import Literal

from pydantic import BaseModel

from personal_api.schemas.common import Entity

LocationCategory = Literal["home", "work", "venue", "city", "other"]


class LocationCreate(BaseModel):
    name: str
    category: LocationCategory | None = None
    address: str | None = None
    city: str | None = None
    region: str | None = None
    notes: str | None = None


class LocationUpdate(BaseModel):
    name: str | None = None
    category: LocationCategory | None = None
    address: str | None = None
    city: str | None = None
    region: str | None = None
    notes: str | None = None


class LocationRead(Entity):
    name: str
    category: str | None
    address: str | None
    city: str | None
    region: str | None
    notes: str | None
