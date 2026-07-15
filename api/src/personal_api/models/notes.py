"""Note — unstructured information, optionally linked to any entity.

``entity_type``/``entity_id`` are a soft polymorphic link (no DB FK, since the
target may be any table). ``entry_date`` supports the daily-journal use case.
"""

import uuid
from datetime import date

from sqlalchemy import Date, Text
from sqlalchemy.dialects.postgresql import ARRAY, UUID
from sqlalchemy.orm import Mapped, mapped_column

from personal_api.db.base import Base
from personal_api.models.mixins import TimestampMixin, UUIDPrimaryKey


class Note(UUIDPrimaryKey, TimestampMixin, Base):
    __tablename__ = "notes"

    title: Mapped[str | None] = mapped_column(Text)
    body: Mapped[str] = mapped_column(Text, nullable=False, server_default="")
    note_type: Mapped[str] = mapped_column(
        Text, server_default="note", nullable=False
    )  # note/journal/idea/meeting/reference
    entry_date: Mapped[date | None] = mapped_column(Date, index=True)
    mood: Mapped[str | None] = mapped_column(Text)
    tags: Mapped[list[str]] = mapped_column(ARRAY(Text), server_default="{}")
    entity_type: Mapped[str | None] = mapped_column(Text)
    entity_id: Mapped[uuid.UUID | None] = mapped_column(UUID(as_uuid=True), index=True)
