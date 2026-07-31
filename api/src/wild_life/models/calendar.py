"""Event — a time-bound calendar item."""

import uuid
from datetime import datetime

from sqlalchemy import (
    DateTime,
    ForeignKey,
    Integer,
    Text,
    UniqueConstraint,
)
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column

from wild_life.db.base import Base
from wild_life.models.mixins import TimestampMixin, UUIDPrimaryKey


class SentInvite(UUIDPrimaryKey, TimestampMixin, Base):
    """Ledger of iMIP messages already emailed for a hosted event — makes the
    mail tick idempotent (mirrors SentReminder).

    A ``(event, attendee_email, REQUEST, sequence)`` row means that attendee got
    the invite at that revision; bumping the event's ``sequence`` opens a fresh
    gap → re-send as an update. A ``CANCEL`` row records a withdrawal.
    """

    __tablename__ = "sent_invites"
    __table_args__ = (
        UniqueConstraint(
            "moment_id",
            "attendee_email",
            "method",
            "sequence",
            name="uq_sent_invite",
        ),
    )

    # What has already left the building, keyed to the thing that can leave it.
    # A ledger row that cannot find its moment must read as "not yet sent"
    # rather than raise inside a loop that emails people.
    moment_id: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("moments.id", ondelete="CASCADE"),
        index=True,
    )
    attendee_email: Mapped[str] = mapped_column(Text, nullable=False)
    # "REQUEST" | "CANCEL"
    method: Mapped[str] = mapped_column(Text, nullable=False)
    sequence: Mapped[int] = mapped_column(Integer, nullable=False)


class AttendeeResponse(UUIDPrimaryKey, TimestampMixin, Base):
    """A guest's RSVP to an event I host, ingested from an inbound METHOD:REPLY.

    Distinct from the event's own ``rsvp_status``/``rsvp_sent_status`` (which are
    *my* reply to invites *I* received). One row per (event, guest email),
    upserted as newer replies arrive.
    """

    __tablename__ = "attendee_responses"
    __table_args__ = (
        UniqueConstraint("moment_id", "attendee_email", name="uq_attendee_response"),
    )

    # What has already left the building, keyed to the thing that can leave it.
    # A ledger row that cannot find its moment must read as "not yet sent"
    # rather than raise inside a loop that emails people.
    moment_id: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("moments.id", ondelete="CASCADE"),
        index=True,
    )
    attendee_email: Mapped[str] = mapped_column(Text, nullable=False)
    # needs-action | accepted | declined | tentative
    partstat: Mapped[str] = mapped_column(Text, nullable=False)
    comment: Mapped[str | None] = mapped_column(Text)
    sequence: Mapped[int | None] = mapped_column(Integer)
    responded_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
