"""Routine — the unified 'regimen' unit — and its completable instances.

A Routine is a recurring thing you do or take on a cadence: a medication dose, a
supplement, a behavioral activity, or a standalone habit. It may take a
``Medication`` (``medication_id``), be a pure ``activity``, and/or belong to a
``Protocol`` bundle (``protocol_id``). The regimen (``regimen.py``) is the derived
set of routines due in a time window. Cadence follows the HL7 FHIR Timing subset
(``timing``/``days_of_week``/``interval_days``/``as_needed``), the same model dose
lines use.
"""

import uuid
from datetime import date, datetime

from sqlalchemy import (
    Boolean,
    Date,
    DateTime,
    ForeignKey,
    Index,
    Integer,
    Numeric,
    Text,
    text,
)
from sqlalchemy.dialects.postgresql import ARRAY, UUID
from sqlalchemy.orm import Mapped, mapped_column

from wild_life.db.base import Base
from wild_life.models.mixins import TimestampMixin, UUIDPrimaryKey


class Routine(UUIDPrimaryKey, TimestampMixin, Base):
    __tablename__ = "routines"

    # Label: an activity/habit's free text; null for medication routines (the label
    # comes from the linked medication). ``name`` is the legacy label, folded into
    # ``activity`` during the migration and dropped afterward.
    activity: Mapped[str | None] = mapped_column(Text)
    name: Mapped[str | None] = mapped_column(Text)

    # What it is: a medication dose and/or a member of a protocol bundle.
    medication_id: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("medications.id", ondelete="SET NULL"),
        index=True,
    )
    # Every routine is a step of a protocol (the one container for anything recurring).
    protocol_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("protocols.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    # The prescribed dose = ``amount`` + ``unit`` — usually a measure ("500" + "mg",
    # "5" + "ml", "2" + "puffs"), not a pill count.
    amount: Mapped[float | None] = mapped_column(Numeric)
    unit: Mapped[str | None] = mapped_column(Text)

    # Cadence (FHIR Timing subset): times of day, which weekdays (empty = daily),
    # every-N-days. (Scheduling is a protocol's job; ad-hoc dosing is "log a dose".)
    timing: Mapped[list[str]] = mapped_column(ARRAY(Text), server_default="{}")
    days_of_week: Mapped[list[str]] = mapped_column(ARRAY(Text), server_default="{}")
    interval_days: Mapped[int] = mapped_column(
        Integer, server_default="1", nullable=False
    )
    sort_order: Mapped[int] = mapped_column(Integer, server_default="0", nullable=False)

    # Context (standalone routines file under an area/program; med/protocol routines
    # derive liveness from their parent instead).
    area_id: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True), ForeignKey("areas.id", ondelete="SET NULL"), index=True
    )
    program_id: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True), ForeignKey("programs.id", ondelete="SET NULL"), index=True
    )
    responsible_id: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True), ForeignKey("people.id", ondelete="SET NULL")
    )
    status: Mapped[str] = mapped_column(
        Text, server_default="active", nullable=False
    )  # active/paused/archived
    start_date: Mapped[date | None] = mapped_column(Date)
    end_date: Mapped[date | None] = mapped_column(Date)
    notes: Mapped[str | None] = mapped_column(Text)

    # Legacy free-text cadence — superseded by the structured cadence above, kept
    # until the best-effort migration lands, then dropped.
    frequency: Mapped[str | None] = mapped_column(Text)
    preferred_days: Mapped[list[str]] = mapped_column(ARRAY(Text), server_default="{}")
    preferred_time: Mapped[str | None] = mapped_column(Text)
    tracking_method: Mapped[str | None] = mapped_column(Text)


class RoutineInstance(UUIDPrimaryKey, TimestampMixin, Base):
    """An **intake** — a taking event: what was taken, how much, and when.

    Self-contained: it always names a ``medication_id`` and carries its own dose
    (``amount`` + ``unit``) and ``completed_at``. ``routine_id`` is **optional** — set
    when the intake fulfils a prescription (drives compliance/adherence), null for an
    un-prescribed one-off. Logging against a routine merely *pre-fills* the dose.

    ``ad_hoc`` tells the two apart:

    - ``ad_hoc=False`` — a **scheduled check-off** (the Today checkbox); at most one per
      ``(routine, scheduled_date, slot)`` via the partial unique index below, so a
      re-check is idempotent.
    - ``ad_hoc=True`` — an **extra / PRN / backdated / un-prescribed** intake,
      unconstrained. Absorbs the old ``MedicationDose``.

    (Table name kept ``routine_instances`` though routine is now optional.)
    """

    __tablename__ = "routine_instances"

    # What was taken (the owner of an intake's history); which plan it fulfils
    # (optional context). Deleting a medication removes its intakes; deleting a
    # routine keeps them (a med intake still stands on its own).
    medication_id: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("medications.id", ondelete="CASCADE"),
        index=True,
    )
    routine_id: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("routines.id", ondelete="SET NULL"),
        index=True,
    )
    scheduled_date: Mapped[date] = mapped_column(Date, nullable=False, index=True)
    slot: Mapped[str] = mapped_column(Text, server_default="", nullable=False)
    status: Mapped[str] = mapped_column(
        Text, server_default="pending", nullable=False
    )  # pending/done/skipped
    completed_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    # The dose actually taken (self-contained; pre-filled from the routine if any).
    amount: Mapped[float | None] = mapped_column(Numeric)
    unit: Mapped[str | None] = mapped_column(Text)
    ad_hoc: Mapped[bool] = mapped_column(
        Boolean, server_default="false", nullable=False
    )  # True = extra/PRN/backdated/un-prescribed intake (not a scheduled check-off)
    notes: Mapped[str | None] = mapped_column(Text)

    __table_args__ = (
        # Scheduled check-offs are unique per (routine, day, slot); ad-hoc intakes aren't.
        Index(
            "uq_routine_instance_scheduled",
            "routine_id",
            "scheduled_date",
            "slot",
            unique=True,
            postgresql_where=text("ad_hoc = false"),
        ),
    )
