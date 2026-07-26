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

from sqlalchemy import Date, DateTime, Float, ForeignKey, Index, Text
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
    )  # OutcomeKind: standard/target/deliverable
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

    # `deliverable` kind: when the criterion was accepted.
    satisfied_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
