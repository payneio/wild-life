"""Schemas for Person."""

from datetime import date

from typing import Annotated

from pydantic import BaseModel, BeforeValidator

from wild_life.phone import normalize_methods
from wild_life.schemas.common import Entity, LabelledAddress


class ContactMethod(BaseModel):
    """A phone or email with an optional type label (mobile/home/work…).

    Addresses used to share this shape, which is why an address was a single
    opaque string. They now carry the shared postal vocabulary instead — see
    `LabelledAddress` in schemas/common.
    """

    value: str
    label: str | None = None


# `ContactMethod` is shared by phones and emails, so canonicalisation
# binds to the phone *fields* rather than the model.
PhoneMethods = Annotated[list[ContactMethod], BeforeValidator(normalize_methods)]
OptionalPhoneMethods = Annotated[
    list[ContactMethod] | None, BeforeValidator(normalize_methods)
]


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
    phones: PhoneMethods = []
    emails: list[ContactMethod] = []
    addresses: list[LabelledAddress] = []
    websites: list[str] = []
    preferred_contact: str | None = None
    birthday: date | None = None
    important_dates: list[ImportantDate] = []
    photo_url: str | None = None


class PersonUpdate(BaseModel):
    name: str | None = None
    nickname: str | None = None
    relationship: str | None = None
    role: str | None = None
    job_title: str | None = None
    specialty: str | None = None
    patient_id: str | None = None
    portal_url: str | None = None
    phones: OptionalPhoneMethods = None
    emails: list[ContactMethod] | None = None
    addresses: list[LabelledAddress] | None = None
    websites: list[str] | None = None
    preferred_contact: str | None = None
    birthday: date | None = None
    important_dates: list[ImportantDate] | None = None
    photo_url: str | None = None


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
    addresses: list[LabelledAddress]
    websites: list[str]
    preferred_contact: str | None
    birthday: date | None
    important_dates: list[ImportantDate]
    photo_url: str | None
