"""Schemas for Area, Program, Project."""

import uuid
from datetime import date, datetime

from pydantic import BaseModel

from wild_life.schemas.common import (
    AreaStatus,
    Entity,
    Priority,
    ProgramStatus,
    ProjectStatus,
)


# --- Area -------------------------------------------------------------------
class AreaCreate(BaseModel):
    name: str
    description: str | None = None
    status: AreaStatus = "active"
    desired_standard: str | None = None
    review_frequency: str | None = None
    accountable_owner_id: uuid.UUID | None = None
    responsible_lead_id: uuid.UUID | None = None
    notes: str | None = None


class AreaUpdate(BaseModel):
    name: str | None = None
    description: str | None = None
    status: AreaStatus | None = None
    desired_standard: str | None = None
    review_frequency: str | None = None
    accountable_owner_id: uuid.UUID | None = None
    responsible_lead_id: uuid.UUID | None = None
    notes: str | None = None
    archived_at: datetime | None = None


class AreaRead(Entity):
    name: str
    description: str | None
    status: str
    desired_standard: str | None
    review_frequency: str | None
    accountable_owner_id: uuid.UUID | None
    responsible_lead_id: uuid.UUID | None
    notes: str | None
    archived_at: datetime | None


# --- Program ----------------------------------------------------------------
class ProgramCreate(BaseModel):
    name: str
    description: str | None = None
    area_id: uuid.UUID | None = None
    intended_outcome: str | None = None
    success_criteria: str | None = None
    status: ProgramStatus = "proposed"
    start_date: date | None = None
    target_date: date | None = None
    accountable_owner_id: uuid.UUID | None = None
    responsible_lead_id: uuid.UUID | None = None
    review_frequency: str | None = None
    reporting_cadence: str | None = None
    notes: str | None = None


class ProgramUpdate(BaseModel):
    name: str | None = None
    description: str | None = None
    area_id: uuid.UUID | None = None
    intended_outcome: str | None = None
    success_criteria: str | None = None
    status: ProgramStatus | None = None
    start_date: date | None = None
    target_date: date | None = None
    accountable_owner_id: uuid.UUID | None = None
    responsible_lead_id: uuid.UUID | None = None
    review_frequency: str | None = None
    reporting_cadence: str | None = None
    notes: str | None = None


class ProgramRead(Entity):
    name: str
    description: str | None
    area_id: uuid.UUID | None
    intended_outcome: str | None
    success_criteria: str | None
    status: str
    start_date: date | None
    target_date: date | None
    accountable_owner_id: uuid.UUID | None
    responsible_lead_id: uuid.UUID | None
    review_frequency: str | None
    reporting_cadence: str | None
    notes: str | None


# --- Project ----------------------------------------------------------------
class ProjectCreate(BaseModel):
    name: str
    description: str | None = None
    area_id: uuid.UUID | None = None
    program_id: uuid.UUID | None = None
    intended_outcome: str | None = None
    completion_criteria: str | None = None
    status: ProjectStatus = "proposed"
    priority: Priority = "medium"
    start_date: date | None = None
    target_date: date | None = None
    accountable_owner_id: uuid.UUID | None = None
    responsible_lead_id: uuid.UUID | None = None
    next_action: str | None = None
    last_activity_date: date | None = None
    notes: str | None = None


class ProjectUpdate(BaseModel):
    name: str | None = None
    description: str | None = None
    area_id: uuid.UUID | None = None
    program_id: uuid.UUID | None = None
    intended_outcome: str | None = None
    completion_criteria: str | None = None
    status: ProjectStatus | None = None
    priority: Priority | None = None
    start_date: date | None = None
    target_date: date | None = None
    accountable_owner_id: uuid.UUID | None = None
    responsible_lead_id: uuid.UUID | None = None
    next_action: str | None = None
    last_activity_date: date | None = None
    notes: str | None = None


class ProjectRead(Entity):
    name: str
    description: str | None
    area_id: uuid.UUID | None
    program_id: uuid.UUID | None
    intended_outcome: str | None
    completion_criteria: str | None
    status: str
    priority: str
    start_date: date | None
    target_date: date | None
    accountable_owner_id: uuid.UUID | None
    responsible_lead_id: uuid.UUID | None
    next_action: str | None
    last_activity_date: date | None
    notes: str | None
