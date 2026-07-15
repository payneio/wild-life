"""Schemas for Person and Interaction."""

import uuid
from datetime import date, datetime

from pydantic import BaseModel

from personal_api.schemas.common import Entity


class ContactMethod(BaseModel):
    """A phone/email/address with an optional type label (mobile/home/work…)."""

    value: str
    label: str | None = None


class ImportantDate(BaseModel):
    label: str | None = None
    date: str  # ISO date, or partial like "--MM-DD" (no year)


class PersonCreate(BaseModel):
    name: str
    nickname: str | None = None
    relationship: str | None = None
    role: str | None = None
    job_title: str | None = None
    specialty: str | None = None
    patient_id: str | None = None
    portal_url: str | None = None
    phones: list[ContactMethod] = []
    emails: list[ContactMethod] = []
    addresses: list[ContactMethod] = []
    websites: list[str] = []
    preferred_contact: str | None = None
    birthday: date | None = None
    important_dates: list[ImportantDate] = []
    photo_url: str | None = None
    notes: str | None = None


class PersonUpdate(BaseModel):
    name: str | None = None
    nickname: str | None = None
    relationship: str | None = None
    role: str | None = None
    job_title: str | None = None
    specialty: str | None = None
    patient_id: str | None = None
    portal_url: str | None = None
    phones: list[ContactMethod] | None = None
    emails: list[ContactMethod] | None = None
    addresses: list[ContactMethod] | None = None
    websites: list[str] | None = None
    preferred_contact: str | None = None
    birthday: date | None = None
    important_dates: list[ImportantDate] | None = None
    photo_url: str | None = None
    notes: str | None = None


class PersonRead(Entity):
    name: str
    nickname: str | None
    relationship: str | None
    role: str | None
    job_title: str | None
    specialty: str | None
    patient_id: str | None
    portal_url: str | None
    phones: list[ContactMethod]
    emails: list[ContactMethod]
    addresses: list[ContactMethod]
    websites: list[str]
    preferred_contact: str | None
    birthday: date | None
    important_dates: list[ImportantDate]
    photo_url: str | None
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
