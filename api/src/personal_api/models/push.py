"""Web Push — browser push subscriptions and the sent-reminder ledger."""

import uuid
from datetime import datetime

from sqlalchemy import DateTime, ForeignKey, Integer, Text, UniqueConstraint
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column

from personal_api.db.base import Base
from personal_api.models.mixins import TimestampMixin, UUIDPrimaryKey


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
            "event_id",
            "occurrence_start",
            "lead_minutes",
            name="uq_sent_reminder",
        ),
    )

    event_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("events.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    occurrence_start: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False
    )
    lead_minutes: Mapped[int] = mapped_column(Integer, nullable=False)
