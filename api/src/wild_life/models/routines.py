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

from sqlalchemy import Boolean, Date, DateTime, ForeignKey, Integer, Numeric, Text
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
    protocol_id: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True), ForeignKey("protocols.id", ondelete="CASCADE"), index=True
    )
    amount: Mapped[float | None] = mapped_column(
        Numeric
    )  # dose quantity (med routines)

    # Cadence (FHIR Timing subset): times of day, which weekdays (empty = daily),
    # every-N-days, and PRN.
    timing: Mapped[list[str]] = mapped_column(ARRAY(Text), server_default="{}")
    days_of_week: Mapped[list[str]] = mapped_column(ARRAY(Text), server_default="{}")
    interval_days: Mapped[int] = mapped_column(
        Integer, server_default="1", nullable=False
    )
    as_needed: Mapped[bool] = mapped_column(
        Boolean, server_default="false", nullable=False
    )
    trigger: Mapped[str | None] = mapped_column(Text)  # PRN reason / condition
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
    """A single completed occurrence of a routine (preserves history).

    One row = a routine done on a day, at a ``slot`` (a med's time-of-day; ``''``
    for slotless activities/habits). Absorbs the old ``MedicationDose``.
    """

    __tablename__ = "routine_instances"

    routine_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("routines.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    scheduled_date: Mapped[date] = mapped_column(Date, nullable=False, index=True)
    slot: Mapped[str] = mapped_column(Text, server_default="", nullable=False)
    status: Mapped[str] = mapped_column(
        Text, server_default="pending", nullable=False
    )  # pending/done/skipped
    completed_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    notes: Mapped[str | None] = mapped_column(Text)
