"""Schemas for Organization and Affiliation."""

import uuid
from datetime import date
from typing import Literal

from pydantic import BaseModel

from wild_life.schemas.common import Entity, PhoneNumber

OrgType = Literal[
    "employer",
    "client",
    "vendor",
    "partner",
    "nonprofit",
    "school",
    "government",
    "community",
    "other",
]
OrgStatus = Literal["active", "inactive", "archived"]


class OrganizationCreate(BaseModel):
    name: str
    org_type: OrgType | None = None
    industry: str | None = None
    website: str | None = None
    email: str | None = None
    phone: PhoneNumber = None
    street: str | None = None
    unit: str | None = None
    city: str | None = None
    region: str | None = None
    postcode: str | None = None
    country: str | None = None
    description: str | None = None
    status: OrgStatus = "active"
    notes: str | None = None


class OrganizationUpdate(BaseModel):
    name: str | None = None
    org_type: OrgType | None = None
    industry: str | None = None
    website: str | None = None
    email: str | None = None
    phone: PhoneNumber = None
    street: str | None = None
    unit: str | None = None
    city: str | None = None
    region: str | None = None
    postcode: str | None = None
    country: str | None = None
    description: str | None = None
    status: OrgStatus | None = None
    notes: str | None = None


class OrganizationRead(Entity):
    name: str
    org_type: OrgType | None
    industry: str | None
    website: str | None
    email: str | None
    phone: str | None
    street: str | None
    unit: str | None
    city: str | None
    region: str | None
    postcode: str | None
    country: str | None
    description: str | None
    status: OrgStatus
    notes: str | None


class AffiliationCreate(BaseModel):
    person_id: uuid.UUID
    organization_id: uuid.UUID
    role: str | None = None
    is_primary: bool = False
    start_date: date | None = None
    end_date: date | None = None


class AffiliationUpdate(BaseModel):
    person_id: uuid.UUID | None = None
    organization_id: uuid.UUID | None = None
    role: str | None = None
    is_primary: bool | None = None
    start_date: date | None = None
    end_date: date | None = None


class AffiliationRead(Entity):
    person_id: uuid.UUID
    organization_id: uuid.UUID
    role: str | None
    is_primary: bool
    start_date: date | None
    end_date: date | None
