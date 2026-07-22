"""Schemas for Routine (the unified regimen unit) and RoutineInstance."""

import uuid
from datetime import date, datetime

from pydantic import BaseModel

from wild_life.schemas.common import Entity, RoutineInstanceStatus, RoutineStatus
from wild_life.schemas.health import Weekday


class RoutineCreate(BaseModel):
    name: str | None = None  # legacy label; prefer ``activity`` / the linked med
    activity: str | None = None  # non-medication step, e.g. "walk after dinner"
    medication_id: uuid.UUID | None = None
    protocol_id: uuid.UUID | None = None
    amount: float | None = None
    timing: list[str] = []
    days_of_week: list[Weekday] = []
    interval_days: int = 1
    as_needed: bool = False
    trigger: str | None = None
    sort_order: int = 0
    area_id: uuid.UUID | None = None
    program_id: uuid.UUID | None = None
    responsible_id: uuid.UUID | None = None
    status: RoutineStatus = "active"
    start_date: date | None = None
    end_date: date | None = None
    notes: str | None = None
    # legacy free-text cadence (accepted during transition)
    frequency: str | None = None
    preferred_days: list[str] = []
    preferred_time: str | None = None
    tracking_method: str | None = None


class RoutineUpdate(BaseModel):
    name: str | None = None
    activity: str | None = None
    medication_id: uuid.UUID | None = None
    protocol_id: uuid.UUID | None = None
    amount: float | None = None
    timing: list[str] | None = None
    days_of_week: list[Weekday] | None = None
    interval_days: int | None = None
    as_needed: bool | None = None
    trigger: str | None = None
    sort_order: int | None = None
    area_id: uuid.UUID | None = None
    program_id: uuid.UUID | None = None
    responsible_id: uuid.UUID | None = None
    status: RoutineStatus | None = None
    start_date: date | None = None
    end_date: date | None = None
    notes: str | None = None
    frequency: str | None = None
    preferred_days: list[str] | None = None
    preferred_time: str | None = None
    tracking_method: str | None = None


class RoutineRead(Entity):
    name: str | None
    activity: str | None
    medication_id: uuid.UUID | None
    protocol_id: uuid.UUID | None
    amount: float | None
    timing: list[str]
    days_of_week: list[str]
    interval_days: int
    as_needed: bool
    trigger: str | None
    sort_order: int
    area_id: uuid.UUID | None
    program_id: uuid.UUID | None
    responsible_id: uuid.UUID | None
    status: str
    start_date: date | None
    end_date: date | None
    notes: str | None
    frequency: str | None
    preferred_days: list[str]
    preferred_time: str | None
    tracking_method: str | None


class RoutineInstanceCreate(BaseModel):
    routine_id: uuid.UUID
    scheduled_date: date
    slot: str = ""
    status: RoutineInstanceStatus = "pending"
    completed_at: datetime | None = None
    notes: str | None = None


class RoutineInstanceUpdate(BaseModel):
    scheduled_date: date | None = None
    slot: str | None = None
    status: RoutineInstanceStatus | None = None
    completed_at: datetime | None = None
    notes: str | None = None


class RoutineInstanceRead(Entity):
    routine_id: uuid.UUID
    scheduled_date: date
    slot: str
    status: str
    completed_at: datetime | None
    notes: str | None
