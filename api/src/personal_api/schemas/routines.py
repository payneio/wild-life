"""Schemas for Routine and RoutineInstance."""

import uuid
from datetime import date, datetime

from pydantic import BaseModel

from personal_api.schemas.common import Entity, RoutineInstanceStatus, RoutineStatus


class RoutineCreate(BaseModel):
    name: str
    area_id: uuid.UUID | None = None
    program_id: uuid.UUID | None = None
    frequency: str | None = None
    preferred_days: list[str] = []
    preferred_time: str | None = None
    tracking_method: str | None = None
    start_date: date | None = None
    end_date: date | None = None
    responsible_id: uuid.UUID | None = None
    status: RoutineStatus = "active"
    notes: str | None = None


class RoutineUpdate(BaseModel):
    name: str | None = None
    area_id: uuid.UUID | None = None
    program_id: uuid.UUID | None = None
    frequency: str | None = None
    preferred_days: list[str] | None = None
    preferred_time: str | None = None
    tracking_method: str | None = None
    start_date: date | None = None
    end_date: date | None = None
    responsible_id: uuid.UUID | None = None
    status: RoutineStatus | None = None
    notes: str | None = None


class RoutineRead(Entity):
    name: str
    area_id: uuid.UUID | None
    program_id: uuid.UUID | None
    frequency: str | None
    preferred_days: list[str]
    preferred_time: str | None
    tracking_method: str | None
    start_date: date | None
    end_date: date | None
    responsible_id: uuid.UUID | None
    status: str
    notes: str | None


class RoutineInstanceCreate(BaseModel):
    routine_id: uuid.UUID
    scheduled_date: date
    status: RoutineInstanceStatus = "pending"
    completed_at: datetime | None = None
    notes: str | None = None


class RoutineInstanceUpdate(BaseModel):
    scheduled_date: date | None = None
    status: RoutineInstanceStatus | None = None
    completed_at: datetime | None = None
    notes: str | None = None


class RoutineInstanceRead(Entity):
    routine_id: uuid.UUID
    scheduled_date: date
    status: str
    completed_at: datetime | None
    notes: str | None
