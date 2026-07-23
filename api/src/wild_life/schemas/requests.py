"""Schemas for Request (the inbox / ask-answer primitive)."""

import uuid
from datetime import date, datetime

from pydantic import BaseModel

from wild_life.schemas.common import (
    Entity,
    EntityType,
    RequestKind,
    RequestStatus,
)


class RequestCreate(BaseModel):
    # requester defaults to the caller's Person when omitted (set in the router).
    requester_id: uuid.UUID | None = None
    addressee_id: uuid.UUID | None = None
    external_label: str | None = None
    kind: RequestKind = "question"
    subject: str
    body: str | None = None
    entity_type: EntityType | None = None
    entity_id: uuid.UUID | None = None
    needed_by: date | None = None
    follow_up_date: date | None = None
    status: RequestStatus = "open"
    resolution: str | None = None
    last_communication: str | None = None
    next_action: str | None = None


class RequestUpdate(BaseModel):
    addressee_id: uuid.UUID | None = None
    external_label: str | None = None
    kind: RequestKind | None = None
    subject: str | None = None
    body: str | None = None
    entity_type: EntityType | None = None
    entity_id: uuid.UUID | None = None
    needed_by: date | None = None
    follow_up_date: date | None = None
    status: RequestStatus | None = None
    resolution: str | None = None
    resolved_at: datetime | None = None
    last_communication: str | None = None
    next_action: str | None = None


class RequestResolve(BaseModel):
    resolution: str | None = None


class RequestRead(Entity):
    requester_id: uuid.UUID | None
    addressee_id: uuid.UUID | None
    external_label: str | None
    kind: str
    subject: str
    body: str | None
    entity_type: str | None
    entity_id: uuid.UUID | None
    needed_by: date | None
    follow_up_date: date | None
    status: str
    resolution: str | None
    resolved_at: datetime | None
    last_communication: str | None
    next_action: str | None
