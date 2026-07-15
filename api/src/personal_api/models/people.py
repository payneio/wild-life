"""People and interactions (the CRM surface)."""

import uuid
from datetime import datetime

from sqlalchemy import DateTime, ForeignKey, Text
from sqlalchemy.dialects.postgresql import ARRAY, UUID
from sqlalchemy.orm import Mapped, mapped_column

from personal_api.db.base import Base
from personal_api.models.mixins import TimestampMixin, UUIDPrimaryKey


class Person(UUIDPrimaryKey, TimestampMixin, Base):
    """A contact involved in the user's life, work, or delegated work."""

    __tablename__ = "people"

    name: Mapped[str] = mapped_column(Text, nullable=False)
    relationship: Mapped[str | None] = mapped_column(Text)
    organization: Mapped[str | None] = mapped_column(Text)
    role: Mapped[str | None] = mapped_column(Text)
    emails: Mapped[list[str]] = mapped_column(ARRAY(Text), server_default="{}")
    phones: Mapped[list[str]] = mapped_column(ARRAY(Text), server_default="{}")
    preferred_contact: Mapped[str | None] = mapped_column(Text)
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
