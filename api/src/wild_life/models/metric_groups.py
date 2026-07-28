"""MetricGroup — numbers you read together — and the occasions that produce them.

A blood draw, a cuff reading, a monthly look at every account balance: one *act*
producing several values. Three things follow from that, and they are the whole
reason this exists:

- the values share a **moment**, not five timestamps that happen to be close;
- they share a **context** ("fasting"), which belongs to the act and to no single
  number;
- any **ratio** between them is only meaningful *within* one act, so the grouping
  is what makes a derived ratio well-defined rather than a guess about which
  reading pairs with which.

Not a health object, though health is where the proof lives. `derivations.py`
records why manual entry withered — nineteen typed readings against 404 completed
tasks — and derivation answered it for everything the app can compute. It cannot
compute a lab result. This is the other half: making the irreducibly manual case
cost one act instead of one act per number.

The counterpart on the doing side is `Protocol` → `Routine` → `RoutineInstance`:
a named bundle over things that also stand alone, plus a record of each
occurrence. Metrics stay individually addressable because an `Outcome` binds to
one metric and a reference band is per-instrument; the group only gathers them.
"""

import uuid
from datetime import datetime

from sqlalchemy import (
    DateTime,
    ForeignKey,
    Index,
    Integer,
    Text,
    UniqueConstraint,
)
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column

from wild_life.db.base import Base
from wild_life.models.mixins import TimestampMixin, UUIDPrimaryKey


class MetricGroup(UUIDPrimaryKey, TimestampMixin, Base):
    __tablename__ = "metric_groups"
    __table_args__ = (Index("ix_metric_groups_root", "entity_type", "entity_id"),)

    name: Mapped[str] = mapped_column(Text, nullable=False)
    # What this group measures — the same soft-poly root a Metric carries, so a
    # lipid panel sits on the program it serves rather than floating in a catalog.
    entity_type: Mapped[str] = mapped_column(Text, nullable=False)
    entity_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), nullable=False)
    description: Mapped[str | None] = mapped_column(Text)


class GroupMember(UUIDPrimaryKey, TimestampMixin, Base):
    """One metric's place in a group.

    A join row rather than a column on Metric, because a metric belongs to as
    many groups as you like — glucose is read in a metabolic panel and again by a
    meter at home.
    """

    __tablename__ = "group_members"
    __table_args__ = (
        UniqueConstraint("group_id", "metric_id", name="uq_group_members_pair"),
        Index("ix_group_members_group", "group_id"),
    )

    group_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("metric_groups.id", ondelete="CASCADE"),
        nullable=False,
    )
    metric_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("metrics.id", ondelete="CASCADE"),
        nullable=False,
    )
    # The order the capture form asks for them in, which is the order the lab
    # reports them. Plain integers renumbered on reorder: `ranking.py`'s
    # fractional indexing exists to avoid renumbering large sets under
    # concurrency, and a group is ten rows with one writer.
    position: Mapped[int] = mapped_column(Integer, server_default="0", nullable=False)


class GroupReading(UUIDPrimaryKey, TimestampMixin, Base):
    """One occasion — a draw, a sitting — that produced several values.

    Its own row rather than "the entries that share a timestamp", because things
    belong to the occasion and to nothing else: whether you were fasting, which
    lab ran it, the report it came from. Without a row those get copied onto
    every value or dropped.

    HL7 FHIR (already borrowed from for `Routine`'s cadence) keeps `Encounter`
    apart from `DiagnosticReport` for the same reason.
    """

    __tablename__ = "group_readings"
    __table_args__ = (Index("ix_group_readings_group_at", "group_id", "recorded_at"),)

    group_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("metric_groups.id", ondelete="CASCADE"),
        nullable=False,
    )
    recorded_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False, index=True
    )
    # What was true of the whole act — "fasting", "after the flu", "home cuff".
    context: Mapped[str | None] = mapped_column(Text)
    # Set only when the draw really was an appointment you had already scheduled.
    # Deliberately optional and deliberately not an Event itself: events
    # round-trip through iCalendar, and a weight check has no business syncing to
    # anyone's calendar.
    event_id: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True), ForeignKey("events.id", ondelete="SET NULL")
    )
