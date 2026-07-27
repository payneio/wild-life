"""Schemas for Protocol — grouped routines aimed at an outcome."""

import uuid
from datetime import date

from pydantic import BaseModel

from wild_life.schemas.common import Entity


class ProtocolCreate(BaseModel):
    name: str
    category: str | None = None
    intended_outcome: str | None = None
    paused: bool = False
    program_id: uuid.UUID | None = None
    start_date: date | None = None
    end_date: date | None = None
    duration: str | None = None
    provider_id: uuid.UUID | None = None
    notes: str | None = None


class ProtocolUpdate(BaseModel):
    name: str | None = None
    category: str | None = None
    intended_outcome: str | None = None
    paused: bool | None = None
    program_id: uuid.UUID | None = None
    start_date: date | None = None
    end_date: date | None = None
    duration: str | None = None
    provider_id: uuid.UUID | None = None
    notes: str | None = None


class ProtocolRead(Entity):
    name: str
    category: str | None
    intended_outcome: str | None
    paused: bool
    program_id: uuid.UUID | None
    start_date: date | None
    end_date: date | None
    duration: str | None
    provider_id: uuid.UUID | None
    notes: str | None
