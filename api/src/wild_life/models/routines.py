"""Routine — **the rule**: one cadence expression for everything that recurs.

A rule says *what is expected, of what, how often* — and nothing about whether it
happened. It generates moments of one ``kind``: a `dose` of a medication, an
`activity`, an `occasion` on the calendar, a session of `work`. The evaluator
(``rules.py``) answers "what is expected on day D" for all of them, and the
regimen (``regimen.py``) is that question filtered to the clinical kinds.

This is the generalisation decision 9 asked for. Two things it removes:

- **``protocol_id`` is nullable.** Every routine used to be a step of a protocol,
  so a weekly habit had to pose as a clinical one, and liveness could only ever be
  the protocol's. A rule now carries its own window and status, and a protocol —
  when there is one — narrows it further.
- **The cadence monopoly.** There were three expressions of "when does this
  recur": this FHIR Timing subset, ``Event.recurrence`` as an RRULE string, and
  ``Task.recurrence`` as free text, none of which could answer the question
  together. That is the same shape as the nine tables that each invented a word
  for "when", and adding a fourth is what leaving the calendar on the wire form
  would have been.

Cadence still follows the HL7 FHIR Timing subset (``timing``/``days_of_week``/
``interval_days``), with **slots first-class** — ``timing`` is the list of times
of day a rule expects, and one occurrence is due per slot. An RRULE we cannot
translate is materialised as the occurrences we were given, never paraphrased;
the wire form itself lives on ``calendar_records`` (decision 8).
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
    UniqueConstraint,
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
    # A protocol is a *container* a rule may belong to, not the thing that makes
    # it a rule. Nullable since the generalisation: a weekly habit is a rule with
    # no protocol, and used to have to invent one.
    protocol_id: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("protocols.id", ondelete="CASCADE"),
        index=True,
    )
    # The MomentKind this rule generates — `dose`, `activity`, `occasion`, `work`.
    # Stored rather than inferred from which FK is filled: an occasion rule has no
    # medication and no protocol, so the old `medication_id is not None` test
    # cannot name it, and a rule that cannot say what it generates cannot be
    # evaluated alongside the others.
    kind: Mapped[str] = mapped_column(
        Text, server_default="activity", nullable=False, index=True
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
    # Why this routine exists, and who prescribed it.
    rationale: Mapped[str | None] = mapped_column(Text)

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
    # Why this occurrence went the way it did (skipped, doubled, taken late).
    context: Mapped[str | None] = mapped_column(Text)

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


class RuleLink(UUIDPrimaryKey, Base):
    """What a rule's generated moments involve, and in what manner.

    The same four closed roles as :class:`~wild_life.models.moments.MomentLink`,
    and deliberately the same shape: a rule declares the involvement, and each
    moment it generates copies it. One vocabulary for "what does this concern",
    whether the thing concerned has happened yet.

    Typed FKs could not carry this. An occasion rule concerns whatever the meeting
    is about (`subject`), everyone expected at it (`participant`, plural) and where
    it happens (`place`) — and ``medication_id``/``area_id``/``program_id`` can
    express none of those. The existing FKs stay for now because the regimen reads
    them; they are the rule's *filing*, while this is its *subject matter*.
    """

    __tablename__ = "rule_links"
    __table_args__ = (
        UniqueConstraint(
            "rule_id", "role", "entity_type", "entity_id", name="uq_rule_links_edge"
        ),
        Index("ix_rule_links_target", "entity_type", "entity_id"),
    )

    rule_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("routines.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    # MomentRole — participant / place / subject / mention.
    role: Mapped[str] = mapped_column(Text, nullable=False)
    entity_type: Mapped[str] = mapped_column(Text, nullable=False)
    entity_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), nullable=False)
