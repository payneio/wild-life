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
    protocol_id: uuid.UUID  # every routine is a protocol step
    amount: float | None = None
    unit: str | None = None
    timing: list[str] = []
    days_of_week: list[Weekday] = []
    interval_days: int = 1
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
    unit: str | None = None
    timing: list[str] | None = None
    days_of_week: list[Weekday] | None = None
    interval_days: int | None = None
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
    protocol_id: uuid.UUID
    amount: float | None
    unit: str | None
    timing: list[str]
    days_of_week: list[str]
    interval_days: int
    sort_order: int
    area_id: uuid.UUID | None
    program_id: uuid.UUID | None
    responsible_id: uuid.UUID | None
    status: RoutineStatus
    start_date: date | None
    end_date: date | None
    notes: str | None
    frequency: str | None
    preferred_days: list[str]
    preferred_time: str | None
    tracking_method: str | None


class RoutineInstanceCreate(BaseModel):
    medication_id: uuid.UUID | None = None
    routine_id: uuid.UUID | None = None
    scheduled_date: date
    slot: str = ""
    status: RoutineInstanceStatus = "pending"
    completed_at: datetime | None = None
    amount: float | None = None
    unit: str | None = None
    ad_hoc: bool = False
    notes: str | None = None


class RoutineInstanceUpdate(BaseModel):
    medication_id: uuid.UUID | None = None
    routine_id: uuid.UUID | None = None
    scheduled_date: date | None = None
    slot: str | None = None
    status: RoutineInstanceStatus | None = None
    completed_at: datetime | None = None
    amount: float | None = None
    unit: str | None = None
    ad_hoc: bool | None = None
    notes: str | None = None


class RoutineInstanceRead(Entity):
    medication_id: uuid.UUID | None
    routine_id: uuid.UUID | None
    scheduled_date: date
    slot: str
    status: RoutineInstanceStatus
    completed_at: datetime | None
    amount: float | None
    unit: str | None
    ad_hoc: bool
    notes: str | None


class DoseLogCreate(BaseModel):
    """Log an ad-hoc intake (extra / PRN / backdated / un-prescribed) — always inserts.

    ``medication_id`` is required (what was taken). ``routine_id`` is optional: when
    given, the routine's amount/unit/medication pre-fill any omitted field.
    """

    medication_id: uuid.UUID | None = None  # required unless routine_id supplies it
    routine_id: uuid.UUID | None = None
    amount: float | None = None  # defaults to the routine's amount when omitted
    unit: str | None = None  # defaults to the routine's unit when omitted
    slot: str = ""
    scheduled_date: date | None = None  # LOCAL day of the intake (client sends dayOf)
    completed_at: datetime | None = None  # actual time taken; defaults to now
    notes: str | None = None
