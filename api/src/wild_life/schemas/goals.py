"""Schemas for Goal."""

import uuid
from datetime import date
from typing import Literal

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


class ComputedProgress(BaseModel):
    """Progress from three independent sources, plus the headline number.

    `overall` is the first of manual → metric → projects that is set; the rest are
    returned so the client can show *why* the headline reads what it does.
    """

    manual: float | None
    from_projects: float | None
    linked_projects: int
    completed_projects: int
    latest_metric_value: float | None
    from_metric: float | None
    metric_baseline: float | None
    metric_target: float | None
    metric_direction: Literal["up", "down"] | None
    metric_met: bool | None
    overall: float | None
