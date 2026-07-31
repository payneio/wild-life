"""Outcome — a claim about what must be true.

The counterpart to Metric: an outcome says what should hold, a metric is only the
instrument that reads it. That split is why the target band lives here and the
metric carries a *reference* band instead — "under 100" is my claim, "90–130 is
normal" is the world's.

Rooted the way events and notes are (`entity_type`/`entity_id`), so the same object
serves an area's standing standards, a program's targets, and a project's
acceptance criteria without three sets of nullable FKs.
"""

import uuid
from datetime import date, datetime

from sqlalchemy import Boolean, Date, DateTime, Float, ForeignKey, Index, Text
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column

from wild_life.db.base import Base
from wild_life.models.mixins import TimestampMixin, UUIDPrimaryKey


class Outcome(UUIDPrimaryKey, TimestampMixin, Base):
    __tablename__ = "outcomes"
    __table_args__ = (Index("ix_outcomes_root", "entity_type", "entity_id"),)

    # The claim itself, in words — "Triglycerides under 100 mg/dL". This was
    # previously split across `name` and `target_state`, which always restated
    # each other.
    statement: Mapped[str] = mapped_column(Text, nullable=False)
    kind: Mapped[str] = mapped_column(
        Text, nullable=False
    )  # OutcomeKind: standard/target
    description: Mapped[str | None] = mapped_column(Text)

    # What this outcome belongs to — soft-polymorphic, no FK, like notes/events.
    entity_type: Mapped[str] = mapped_column(Text, nullable=False)
    entity_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), nullable=False)

    # Lifecycle only — whether the claim is live. Whether it is *met* is computed
    # from readings on every read and never stored.
    status: Mapped[str] = mapped_column(
        Text, server_default="active", nullable=False
    )  # OutcomeStatus: active/achieved/paused/dropped

    # Null is meaningful: an outcome with no metric is unmeasured, which the
    # review dashboard nudges about rather than treating as an error.
    metric_id: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True), ForeignKey("metrics.id", ondelete="SET NULL"), index=True
    )
    # The acceptable band. Either bound may be null for a one-sided claim —
    # "under 100" is target_max alone.
    target_min: Mapped[float | None] = mapped_column(Float)
    target_max: Mapped[float | None] = mapped_column(Float)

    # `target` kind: where we started and when it has to be true by.
    baseline: Mapped[float | None] = mapped_column(Float)
    by_when: Mapped[date | None] = mapped_column(Date)

    # When the claim became true — and *stayed* true, which is why this belongs
    # to a `target` and not to a `standard`. A standing claim can become false
    # again, so a completion timestamp is a category error for one; its history
    # lives in `OutcomeEvaluation` instead. Set on none of the twenty-one
    # outcomes in the corpus, which is what that category error looks like from
    # the outside.
    satisfied_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    #: Why this claim stopped being live. See `Task.ending_cause`. A5.
    ending_cause: Mapped[str | None] = mapped_column(Text)
    ending_note: Mapped[str | None] = mapped_column(Text)


class OutcomeEvaluation(UUIDPrimaryKey, TimestampMixin, Base):
    """Whether a claim held, on a date. The truth history A3 requires.

    A *target* becomes true and stays true, so `Outcome.satisfied_at` says
    everything about it: one moment, and the claim is discharged.

    A *standard* cannot work that way. "No important relationship neglected" is
    true or false today and can become false again, so a completion timestamp is
    a category error for it — which is why `satisfied_at` is set on none of the
    twenty-one outcomes in the corpus, and why the comment above it, saying an
    outcome is worth dating "whichever kind it is", was reaching for something
    this table provides instead.

    Written at review, because that is when a standing claim gets looked at —
    A3's evaluation and A1's examination are the same act, which is what makes
    the review surface load-bearing rather than reporting.
    """

    __tablename__ = "outcome_evaluations"
    __table_args__ = (
        Index("ix_outcome_evaluations_outcome", "outcome_id", "evaluated_at"),
    )

    outcome_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("outcomes.id", ondelete="CASCADE"),
        nullable=False,
    )
    evaluated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False
    )
    #: Did the claim hold at that moment? Nullable for "looked, could not tell",
    #: which is a different answer from "no" and worth keeping apart from it.
    holds: Mapped[bool | None] = mapped_column(Boolean)
    note: Mapped[str | None] = mapped_column(Text)
