"""Schemas for Routine — **the rule** — and its completable instances."""

import uuid
from datetime import date, datetime

from pydantic import BaseModel, model_validator

from wild_life.schemas.common import (
    Entity,
    MomentKind,
    RoutineInstanceStatus,
    RoutineStatus,
)
from wild_life.schemas.health import Weekday


class RoutineCreate(BaseModel):
    name: str | None = None  # legacy label; prefer ``activity`` / the linked med
    activity: str | None = None  # non-medication step, e.g. "walk after dinner"
    medication_id: uuid.UUID | None = None
    # A container a rule may belong to, not what makes it a rule. Optional since
    # the generalisation: a weekly habit used to have to invent a protocol.
    protocol_id: uuid.UUID | None = None
    # What the rule generates. *Derived*, not asked — the same law the moment
    # vocabulary runs on: a rule with a medication generates doses, and any
    # surface creating another kind (the calendar, a task) states it outright.
    # Defaulting to "activity" instead would have quietly made every dose rule
    # created through the API generate the wrong act.
    kind: MomentKind | None = None
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
    rationale: str | None = None
    # legacy free-text cadence (accepted during transition)
    frequency: str | None = None
    preferred_days: list[str] = []
    preferred_time: str | None = None
    tracking_method: str | None = None

    @model_validator(mode="after")
    def _kind_follows_the_medication(self) -> "RoutineCreate":
        """Fill the kind from what the rule is *of*, unless it was stated.

        One place, so a dose rule cannot be created generating activities. An
        explicit kind always wins — that is how an `occasion` or `work` rule,
        which has no medication and nothing else to infer from, gets written.
        """
        if self.kind is None:
            self.kind = "dose" if self.medication_id is not None else "activity"
        return self


class RoutineUpdate(BaseModel):
    name: str | None = None
    activity: str | None = None
    medication_id: uuid.UUID | None = None
    protocol_id: uuid.UUID | None = None
    kind: MomentKind | None = None
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
    rationale: str | None = None
    frequency: str | None = None
    preferred_days: list[str] | None = None
    preferred_time: str | None = None
    tracking_method: str | None = None


class RoutineRead(Entity):
    name: str | None
    activity: str | None
    medication_id: uuid.UUID | None
    protocol_id: uuid.UUID | None
    kind: MomentKind
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
    rationale: str | None
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
    context: str | None = None


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
    context: str | None = None


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
    context: str | None


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
    context: str | None = None
