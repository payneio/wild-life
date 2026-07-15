"""People and interactions (the CRM surface)."""

import uuid
from datetime import date, datetime

from sqlalchemy import Date, DateTime, ForeignKey, Text
from sqlalchemy.dialects.postgresql import ARRAY, JSONB, UUID
from sqlalchemy.orm import Mapped, mapped_column

from personal_api.db.base import Base
from personal_api.models.mixins import TimestampMixin, UUIDPrimaryKey


class Person(UUIDPrimaryKey, TimestampMixin, Base):
    """A contact involved in the user's life, work, or delegated work."""

    __tablename__ = "people"

    name: Mapped[str] = mapped_column(Text, nullable=False)
    nickname: Mapped[str | None] = mapped_column(Text)
    relationship: Mapped[str | None] = mapped_column(Text)
    role: Mapped[str | None] = mapped_column(Text)
    job_title: Mapped[str | None] = mapped_column(Text)
    # Provider fields (null for ordinary contacts): medical specialty, my patient
    # identifier with them, and their patient-portal URL.
    specialty: Mapped[str | None] = mapped_column(Text)
    patient_id: Mapped[str | None] = mapped_column(Text)
    portal_url: Mapped[str | None] = mapped_column(Text)
    # Typed contact methods: list of {"value": str, "label": str|None}.
    phones: Mapped[list[dict]] = mapped_column(
        JSONB, server_default="[]", nullable=False
    )
    emails: Mapped[list[dict]] = mapped_column(
        JSONB, server_default="[]", nullable=False
    )
    addresses: Mapped[list[dict]] = mapped_column(
        JSONB, server_default="[]", nullable=False
    )
    websites: Mapped[list[str]] = mapped_column(ARRAY(Text), server_default="{}")
    preferred_contact: Mapped[str | None] = mapped_column(Text)
    birthday: Mapped[date | None] = mapped_column(Date)
    # Other dated milestones: list of {"label": str, "date": str}.
    important_dates: Mapped[list[dict]] = mapped_column(
        JSONB, server_default="[]", nullable=False
    )
    photo_url: Mapped[str | None] = mapped_column(Text)
    notes: Mapped[str | None] = mapped_column(Text)


class Interaction(UUIDPrimaryKey, TimestampMixin, Base):
    """A logged touchpoint with a person."""

    __tablename__ = "interactions"

    person_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("people.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    occurred_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False
    )
    kind: Mapped[str] = mapped_column(Text, nullable=False)  # call/email/meeting/note
    summary: Mapped[str | None] = mapped_column(Text)
