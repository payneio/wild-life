"""Schemas for Area, Program, Project."""

import uuid
from datetime import date, datetime

from pydantic import BaseModel

from wild_life.schemas.common import (
    AreaStatus,
    Entity,
    EntityType,
    HealthCategory,
    Priority,
    ProgramStatus,
    ProjectStatus,
)


# --- Area -------------------------------------------------------------------
class AreaCreate(BaseModel):
    name: str
    purpose: str | None = None
    status: AreaStatus = "active"
    review_frequency: str | None = None
    accountable_owner_id: uuid.UUID | None = None
    responsible_lead_id: uuid.UUID | None = None


class AreaUpdate(BaseModel):
    name: str | None = None
    purpose: str | None = None
    status: AreaStatus | None = None
    review_frequency: str | None = None
    accountable_owner_id: uuid.UUID | None = None
    responsible_lead_id: uuid.UUID | None = None
    archived_at: datetime | None = None


class AreaRead(Entity):
    name: str
    purpose: str | None
    status: AreaStatus
    review_frequency: str | None
    accountable_owner_id: uuid.UUID | None
    responsible_lead_id: uuid.UUID | None
    archived_at: datetime | None


# --- Program ----------------------------------------------------------------
class ProgramCreate(BaseModel):
    name: str
    purpose: str | None = None
    area_id: uuid.UUID | None = None
    status: ProgramStatus = "proposed"
    start_date: date | None = None
    ended_date: date | None = None
    accountable_owner_id: uuid.UUID | None = None
    responsible_lead_id: uuid.UUID | None = None
    review_frequency: str | None = None
    reporting_cadence: str | None = None
    category: HealthCategory | None = None
    involves: list[EntityType] = []


class ProgramUpdate(BaseModel):
    name: str | None = None
    purpose: str | None = None
    area_id: uuid.UUID | None = None
    status: ProgramStatus | None = None
    start_date: date | None = None
    ended_date: date | None = None
    accountable_owner_id: uuid.UUID | None = None
    responsible_lead_id: uuid.UUID | None = None
    review_frequency: str | None = None
    reporting_cadence: str | None = None
    category: HealthCategory | None = None
    involves: list[EntityType] | None = None


class ProgramRead(Entity):
    name: str
    purpose: str | None
    area_id: uuid.UUID | None
    status: ProgramStatus
    start_date: date | None
    ended_date: date | None
    accountable_owner_id: uuid.UUID | None
    responsible_lead_id: uuid.UUID | None
    review_frequency: str | None
    reporting_cadence: str | None
    category: HealthCategory | None
    involves: list[EntityType]


# --- Project ----------------------------------------------------------------
# A project serves a program, and only a program — see `models.core.Project`.
# `program_id` is required on create rather than defaulted, so a project cannot
# be brought into being unparented and then quietly float; the capture surfaces
# ask for it (ui-architecture §2b.4).
class ProjectCreate(BaseModel):
    name: str
    purpose: str | None = None
    program_id: uuid.UUID
    status: ProjectStatus = "proposed"
    priority: Priority = "medium"
    start_date: date | None = None
    target_date: date | None = None
    accountable_owner_id: uuid.UUID | None = None
    responsible_lead_id: uuid.UUID | None = None
    next_action: str | None = None
    last_activity_date: date | None = None
    review_frequency: str | None = None


class ProjectUpdate(BaseModel):
    name: str | None = None
    purpose: str | None = None
    # Re-filing is allowed; unparenting is not. `None` here means "not supplied"
    # — the router patches with `exclude_unset`, so an explicit null is rejected
    # by the column rather than silently orphaning the project.
    program_id: uuid.UUID | None = None
    status: ProjectStatus | None = None
    priority: Priority | None = None
    start_date: date | None = None
    target_date: date | None = None
    accountable_owner_id: uuid.UUID | None = None
    responsible_lead_id: uuid.UUID | None = None
    next_action: str | None = None
    last_activity_date: date | None = None
    review_frequency: str | None = None


class ProjectRead(Entity):
    name: str
    purpose: str | None
    program_id: uuid.UUID
    status: ProjectStatus
    priority: Priority
    start_date: date | None
    target_date: date | None
    accountable_owner_id: uuid.UUID | None
    responsible_lead_id: uuid.UUID | None
    next_action: str | None
    last_activity_date: date | None
    review_frequency: str | None
