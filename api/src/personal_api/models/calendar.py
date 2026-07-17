"""Event — a time-bound calendar item."""

import uuid
from datetime import datetime

from sqlalchemy import Boolean, DateTime, ForeignKey, Integer, Text
from sqlalchemy.dialects.postgresql import ARRAY, UUID
from sqlalchemy.orm import Mapped, mapped_column

from personal_api.db.base import Base
from personal_api.models.mixins import TimestampMixin, UUIDPrimaryKey


class Event(UUIDPrimaryKey, TimestampMixin, Base):
    __tablename__ = "events"

    title: Mapped[str] = mapped_column(Text, nullable=False)
    description: Mapped[str | None] = mapped_column(Text)
    location: Mapped[str | None] = mapped_column(Text)
    start_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)
    end_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    all_day: Mapped[bool] = mapped_column(
        Boolean, server_default="false", nullable=False
    )
    attendees: Mapped[list[str]] = mapped_column(ARRAY(Text), server_default="{}")
    # Recurrence — raw RFC-5545 RRULE (e.g. "FREQ=WEEKLY;BYDAY=TU") plus any
    # excluded occurrence dates. Occurrences are expanded on demand (reminders,
    # calendar grid); we store the rule losslessly, not the expansion.
    recurrence: Mapped[str | None] = mapped_column(Text)
    recurrence_exdates: Mapped[list[str]] = mapped_column(
        ARRAY(Text), server_default="{}"
    )
    area_id: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True), ForeignKey("areas.id", ondelete="SET NULL"), index=True
    )
    program_id: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True), ForeignKey("programs.id", ondelete="SET NULL")
    )
    project_id: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True), ForeignKey("projects.id", ondelete="SET NULL")
    )
    # Natural key for events synced/imported from an external source
    # (e.g. "proton:<uid>", "invite:<uid>"). Indexed for idempotent dedup lookups.
    external_ref: Mapped[str | None] = mapped_column(Text, index=True)
    notes: Mapped[str | None] = mapped_column(Text)
    # Invitation / iMIP fields — populated when this event arrived as an emailed
    # meeting request (METHOD:REQUEST). `organizer`/`sequence` are what a valid
    # RSVP (METHOD:REPLY) must echo back. `rsvp_status` is the user's response
    # (needs-action|accepted|declined|tentative); `rsvp_sent_status` records the
    # response last emailed to the organizer, so a change triggers a new reply.
    organizer: Mapped[str | None] = mapped_column(Text)
    sequence: Mapped[int | None] = mapped_column(Integer)
    rsvp_status: Mapped[str | None] = mapped_column(Text)
    rsvp_sent_status: Mapped[str | None] = mapped_column(Text)
