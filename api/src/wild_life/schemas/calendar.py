"""Schemas for Event."""

import uuid
from datetime import datetime

from pydantic import BaseModel

from wild_life.schemas.common import Entity


class EventCreate(BaseModel):
    title: str
    description: str | None = None
    location: str | None = None
    start_at: datetime
    end_at: datetime | None = None
    all_day: bool = False
    attendees: list[str] = []
    recurrence: str | None = None
    recurrence_exdates: list[str] = []
    recurrence_parent_id: uuid.UUID | None = None
    recurrence_id: datetime | None = None
    area_id: uuid.UUID | None = None
    program_id: uuid.UUID | None = None
    project_id: uuid.UUID | None = None
    external_ref: str | None = None
    notes: str | None = None
    organizer: str | None = None
    sequence: int | None = None
    rsvp_status: str | None = None
    rsvp_sent_status: str | None = None


class EventUpdate(BaseModel):
    title: str | None = None
    description: str | None = None
    location: str | None = None
    start_at: datetime | None = None
    end_at: datetime | None = None
    all_day: bool | None = None
    attendees: list[str] | None = None
    recurrence: str | None = None
    recurrence_exdates: list[str] | None = None
    recurrence_parent_id: uuid.UUID | None = None
    recurrence_id: datetime | None = None
    area_id: uuid.UUID | None = None
    program_id: uuid.UUID | None = None
    project_id: uuid.UUID | None = None
    external_ref: str | None = None
    notes: str | None = None
    organizer: str | None = None
    sequence: int | None = None
    rsvp_status: str | None = None
    rsvp_sent_status: str | None = None


class EventRead(Entity):
    title: str
    description: str | None
    location: str | None
    start_at: datetime
    end_at: datetime | None
    all_day: bool
    attendees: list[str]
    recurrence: str | None
    recurrence_exdates: list[str]
    recurrence_parent_id: uuid.UUID | None
    recurrence_id: datetime | None
    area_id: uuid.UUID | None
    program_id: uuid.UUID | None
    project_id: uuid.UUID | None
    external_ref: str | None
    notes: str | None
    organizer: str | None
    sequence: int | None
    rsvp_status: str | None
    rsvp_sent_status: str | None
