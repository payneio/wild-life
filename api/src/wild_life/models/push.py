"""Web Push — browser subscriptions and the ledgers of what was already sent.

**External**, in the `docs/domain.md` sense: none of this would mean anything if
the Web Push protocol went away. Nothing in the domain references it; it
references the domain.

`SentReminder` and `SentNudge` are idempotency ledgers, not history. They exist
so a restart or a re-run cannot deliver the same notification twice, which is why
they key on (what, when) rather than carrying a payload.
"""

import uuid
from datetime import date, datetime

from sqlalchemy import Date, DateTime, ForeignKey, Integer, Text, UniqueConstraint
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column

from wild_life.db.base import Base
from wild_life.models.mixins import TimestampMixin, UUIDPrimaryKey


class PushSubscription(UUIDPrimaryKey, TimestampMixin, Base):
    """A browser Web Push subscription (one per device/browser that opted in)."""

    __tablename__ = "push_subscriptions"
    __table_args__ = (UniqueConstraint("endpoint", name="uq_push_endpoint"),)

    endpoint: Mapped[str] = mapped_column(Text, nullable=False)
    p256dh: Mapped[str] = mapped_column(Text, nullable=False)
    auth: Mapped[str] = mapped_column(Text, nullable=False)
    # Optional label so a device is recognizable in a settings list.
    label: Mapped[str | None] = mapped_column(Text)


class SentReminder(UUIDPrimaryKey, TimestampMixin, Base):
    """Ledger of reminders already delivered — makes the tick idempotent.

    Keyed by (event, occurrence start, lead) so a recurring event fires one
    reminder per occurrence per lead time, and re-ticks never resend.
    """

    __tablename__ = "sent_reminders"
    __table_args__ = (
        UniqueConstraint(
            "moment_id",
            "occurrence_start",
            "lead_minutes",
            name="uq_sent_reminder",
        ),
    )

    moment_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("moments.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    occurrence_start: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False
    )
    lead_minutes: Mapped[int] = mapped_column(Integer, nullable=False)


class SentNudge(UUIDPrimaryKey, TimestampMixin, Base):
    """Ledger of once-per-day nudges (e.g. the morning digest), so re-ticks in
    the same day don't resend. Keyed by (kind, nudge_date)."""

    __tablename__ = "sent_nudges"
    __table_args__ = (UniqueConstraint("kind", "nudge_date", name="uq_sent_nudge"),)

    kind: Mapped[str] = mapped_column(Text, nullable=False)
    nudge_date: Mapped[date] = mapped_column(Date, nullable=False)
