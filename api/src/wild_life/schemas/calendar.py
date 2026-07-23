"""Schemas for Event."""

import uuid
from datetime import datetime

from pydantic import BaseModel, computed_field

from wild_life.config import settings
from wild_life.schemas.common import Entity


class EventCreate(BaseModel):
    title: str
    event_type: str | None = None
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
    entity_type: str | None = None
    entity_id: uuid.UUID | None = None
    external_ref: str | None = None
    organizer: str | None = None
    sequence: int | None = None
    rsvp_status: str | None = None
    rsvp_sent_status: str | None = None


class EventUpdate(BaseModel):
    title: str | None = None
    event_type: str | None = None
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
    entity_type: str | None = None
    entity_id: uuid.UUID | None = None
    external_ref: str | None = None
    organizer: str | None = None
    sequence: int | None = None
    rsvp_status: str | None = None
    rsvp_sent_status: str | None = None


class EventRead(Entity):
    title: str
    event_type: str | None
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
    entity_type: str | None
    entity_id: uuid.UUID | None
    external_ref: str | None
    organizer: str | None
    sequence: int | None
    rsvp_status: str | None
    rsvp_sent_status: str | None
    invites_enabled: bool
    cancelled_at: datetime | None

    @computed_field  # type: ignore[prop-decorator]
    @property
    def received_invite(self) -> bool:
        """True when this is an invite I received (organizer is someone else) —
        as opposed to an event I host (organizer is me or unset)."""
        org = (self.organizer or "").replace("mailto:", "").strip().lower()
        return bool(org) and org != settings.self_address
