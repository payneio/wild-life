"""Schemas for Person and Interaction."""

import uuid
from datetime import datetime

from pydantic import BaseModel

from personal_api.schemas.common import Entity


class PersonCreate(BaseModel):
    name: str
    relationship: str | None = None
    organization: str | None = None
    role: str | None = None
    emails: list[str] = []
    phones: list[str] = []
    preferred_contact: str | None = None
    notes: str | None = None


class PersonUpdate(BaseModel):
    name: str | None = None
    relationship: str | None = None
    organization: str | None = None
    role: str | None = None
    emails: list[str] | None = None
    phones: list[str] | None = None
    preferred_contact: str | None = None
    notes: str | None = None


class PersonRead(Entity):
    name: str
    relationship: str | None
    organization: str | None
    role: str | None
    emails: list[str]
    phones: list[str]
    preferred_contact: str | None
    notes: str | None


class InteractionCreate(BaseModel):
    person_id: uuid.UUID
    occurred_at: datetime
    kind: str
    summary: str | None = None


class InteractionUpdate(BaseModel):
    person_id: uuid.UUID | None = None
    occurred_at: datetime | None = None
    kind: str | None = None
    summary: str | None = None


class InteractionRead(Entity):
    person_id: uuid.UUID
    occurred_at: datetime
    kind: str
    summary: str | None
