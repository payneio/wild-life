"""Schemas for Goal."""

import uuid
from datetime import date

from pydantic import BaseModel

from wild_life.schemas.common import Entity, GoalStatus


class GoalCreate(BaseModel):
    name: str
    description: str | None = None
    area_id: uuid.UUID | None = None
    program_id: uuid.UUID | None = None
    metric_id: uuid.UUID | None = None
    condition_id: uuid.UUID | None = None
    target_state: str | None = None
    target_value: float | None = None
    baseline: float | None = None
    target_date: date | None = None
    status: GoalStatus = "active"
    progress: float | None = None
    measurement_method: str | None = None


class GoalUpdate(BaseModel):
    name: str | None = None
    description: str | None = None
    area_id: uuid.UUID | None = None
    program_id: uuid.UUID | None = None
    metric_id: uuid.UUID | None = None
    condition_id: uuid.UUID | None = None
    target_state: str | None = None
    target_value: float | None = None
    baseline: float | None = None
    target_date: date | None = None
    status: GoalStatus | None = None
    progress: float | None = None
    measurement_method: str | None = None


class GoalRead(Entity):
    name: str
    description: str | None
    area_id: uuid.UUID | None
    program_id: uuid.UUID | None
    metric_id: uuid.UUID | None
    condition_id: uuid.UUID | None
    target_state: str | None
    target_value: float | None
    baseline: float | None
    target_date: date | None
    status: GoalStatus
    progress: float | None
    measurement_method: str | None
