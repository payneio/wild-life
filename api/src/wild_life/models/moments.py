"""Moment — something that happened, or that you intend to happen.

The spine of the app. A life is a series of moments; areas, programs, people and
medications are their subjects and objects, not their owners. See
``api/docs/moments.md`` for the kind vocabulary and the migration mapping, and
the design record for why.

Four properties of the model are load-bearing enough to state here:

- **Tense is not a type.** Occurrence (``started_at``) and intention
  (``window_start``/``window_end``) are separate columns on one row, so a planned
  lunch and a lunch you ate differ by which is filled. Both may be set: the delta
  between "planned two hours" and "took four" is the only way estimation ever
  improves, so an occurrence never overwrites the intention that preceded it.
- **Precision is window width.** There is no precision enum. "Sometime in June"
  is a month-wide window; "4pm Tuesday" is a window as wide as the duration.
  Scheduling is the window contracting until it equals ``expected_minutes``.
- **A lapse is derived, never written**: ``window_end < now AND started_at IS
  NULL AND withdrawn_at IS NULL``. No tick maintains it and nothing can go
  stale. ``withdrawn_at`` is the opposite case and *is* stored — deciding not to
  do something is an act, and telling it apart from letting a date pass is worth
  a column.
- **Involvement, not rootedness.** A moment has no single home; it links to what
  it involves (see :class:`MomentLink`), so an appointment can concern the
  program *and* the medication without choosing.
"""

import uuid
from datetime import datetime

from sqlalchemy import (
    Boolean,
    DateTime,
    Float,
    ForeignKey,
    Index,
    Integer,
    Text,
    UniqueConstraint,
)
from sqlalchemy.dialects.postgresql import ARRAY, UUID
from sqlalchemy.orm import Mapped, mapped_column

from wild_life.db.base import Base
from wild_life.models.mixins import TimestampMixin, UUIDPrimaryKey


class Moment(UUIDPrimaryKey, TimestampMixin, Base):
    __tablename__ = "moments"
    __table_args__ = (
        Index("ix_moments_started_at", "started_at"),
        Index("ix_moments_kind_started_at", "kind", "started_at"),
        # The unfulfilled-intention query: a window that has passed with nothing
        # having happened in it.
        Index("ix_moments_window_end", "window_end"),
    )

    # MomentKind. Written by the surface that creates the moment, never asked of
    # the user; `capture` means the surface could not know, which is the inbox.
    kind: Mapped[str] = mapped_column(Text, nullable=False, index=True)

    # --- occurrence: what happened. Null until it does. ---------------------
    started_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    ended_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    # Day precision rather than a clock time — what day did that happen. Kept as
    # a flag rather than inferred from a midnight-to-midnight extent, which is a
    # legitimate 24-hour occurrence and would be indistinguishable.
    all_day: Mapped[bool] = mapped_column(
        Boolean, server_default="false", nullable=False
    )

    # --- intention: where it should land, and for how long -------------------
    window_start: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    window_end: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    expected_minutes: Mapped[int | None] = mapped_column(Integer)

    title: Mapped[str | None] = mapped_column(Text)
    body: Mapped[str] = mapped_column(Text, nullable=False, server_default="")

    # MomentSource. `derived` rows are rebuildable from their source and a
    # rebuild may replace them; authored ones never may.
    source: Mapped[str] = mapped_column(
        Text, server_default="authored", nullable=False, index=True
    )

    withdrawn_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    withdrawal_reason: Mapped[str | None] = mapped_column(Text)


class MomentLink(UUIDPrimaryKey, Base):
    """What a moment involves, and in what manner.

    Generalises ``EntityLink`` (whose ``relation`` column is the same idea, first
    used for event attendees) and absorbs ``note_mentions``, ``events.location_id``
    and the single ``entity_type``/``entity_id`` root. **The timeline of X is the
    moments linked to X** — one query, whatever X is.

    A surrogate ``id`` rather than the natural five-column tuple, because payload
    hangs off the link and a five-column foreign key from every reading is
    unworkable. The uniqueness the tuple gave is kept as a constraint.

    Both ends are soft (no FK on the target): the target may be any table.
    """

    __tablename__ = "moment_links"
    __table_args__ = (
        UniqueConstraint(
            "moment_id",
            "role",
            "entity_type",
            "entity_id",
            name="uq_moment_links_edge",
        ),
        Index("ix_moment_links_target", "entity_type", "entity_id"),
    )

    moment_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("moments.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    # MomentRole — participant / place / subject / mention.
    role: Mapped[str] = mapped_column(Text, nullable=False)
    entity_type: Mapped[str] = mapped_column(Text, nullable=False)
    entity_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), nullable=False)


class MomentReading(Base):
    """The value a measurement produced, for one metric it measured.

    Payload belongs to the *pairing* of a moment and a thing, not to either
    alone: a lipid panel is one act with five metrics at five values. This is
    ``MetricEntry`` re-keyed — ``value`` and the per-value ``context`` survive
    unchanged, while the act-level context ("fasting") moves to the moment, which
    is where ``MetricGroup``'s own docstring says it belongs.
    """

    __tablename__ = "moment_readings"

    link_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("moment_links.id", ondelete="CASCADE"),
        primary_key=True,
    )
    value: Mapped[float] = mapped_column(Float, nullable=False)
    context: Mapped[str | None] = mapped_column(Text)


class MomentDose(Base):
    """How much of one medication a dose moment took.

    The same shape as :class:`MomentReading` and for the same reason: a morning
    stack is one act with five medications, each at its own amount.
    """

    __tablename__ = "moment_doses"

    link_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("moment_links.id", ondelete="CASCADE"),
        primary_key=True,
    )
    amount: Mapped[float | None] = mapped_column(Float)
    unit: Mapped[str | None] = mapped_column(Text)


class CalendarRecord(Base):
    """A moment's shared projection — the only thing that can leave this system.

    Privacy is structural rather than a filter: a moment with no calendar record
    has nothing to export, so the question is never "did the export query say
    WHERE correctly" but "which moments were given one".

    iCal lives at the edge. Our rules are ours (see the generalised ``Routine``);
    this stores the **wire form verbatim**, because replying to an invitation
    means echoing back exactly what arrived — ``organizer``, ``sequence`` and the
    UID are one system with EXDATE and RECURRENCE-ID and must not be paraphrased.
    An inbound rule we cannot translate is materialised as the occurrences we
    were given; an outbound rule RFC-5545 cannot state exports as RDATE.
    """

    __tablename__ = "calendar_records"

    moment_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("moments.id", ondelete="CASCADE"),
        primary_key=True,
    )
    # Natural key for a synced/imported occasion ("proton:<uid>", "invite:<uid>").
    external_ref: Mapped[str | None] = mapped_column(Text, index=True)
    # Addresses, not people. Who was actually there is a participant link on the
    # moment; this is the protocol payload, and conflating the two is what made
    # "every moment with Melissa" unanswerable.
    attendees: Mapped[list[str]] = mapped_column(ARRAY(Text), server_default="{}")
    organizer: Mapped[str | None] = mapped_column(Text)
    sequence: Mapped[int | None] = mapped_column(Integer)
    rsvp_status: Mapped[str | None] = mapped_column(Text)
    rsvp_sent_status: Mapped[str | None] = mapped_column(Text)
    invites_enabled: Mapped[bool] = mapped_column(
        Boolean, server_default="false", nullable=False
    )
    # Wire recurrence, stored losslessly and expanded on demand.
    recurrence: Mapped[str | None] = mapped_column(Text)
    recurrence_exdates: Mapped[list[str]] = mapped_column(
        ARRAY(Text), server_default="{}"
    )
    recurrence_parent_id: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True), ForeignKey("moments.id", ondelete="CASCADE"), index=True
    )
    recurrence_id: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    cancelled_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
