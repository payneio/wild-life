"""Note — unstructured information, optionally linked to any entity.

``entity_type``/``entity_id`` are a soft polymorphic link (no DB FK, since the
target may be any table). ``entry_date`` supports the daily-journal use case.
"""

import uuid
from datetime import date

from sqlalchemy import Date, ForeignKey, Index, Integer, Text
from sqlalchemy.dialects.postgresql import ARRAY, UUID
from sqlalchemy.orm import Mapped, mapped_column

from wild_life.db.base import Base
from wild_life.models.mixins import TimestampMixin, UUIDPrimaryKey


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


class NoteMention(Base):
    """A note's link to another entity (soft-polymorphic; no DB FK on target).

    A note can mention many entities; the reverse index powers backlinks
    ("notes that mention X"). Reconciled from the note's ``links`` on save.
    """

    __tablename__ = "note_mentions"
    __table_args__ = (Index("ix_note_mentions_target", "target_type", "target_id"),)

    note_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("notes.id", ondelete="CASCADE"),
        primary_key=True,
    )
    target_type: Mapped[str] = mapped_column(Text, primary_key=True)
    target_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True)


class NoteImage(UUIDPrimaryKey, TimestampMixin, Base):
    """An image attached to a note.

    Bytes live on disk at ``$DATA_DIR/note_images/<note_id>/<image_id>``; this row
    holds the metadata. Referenced inline in the note body as the markdown image
    ``![alt](note-image:<image_id>)`` and served (bearer-protected) from
    ``GET /note-images/<image_id>``.
    """

    __tablename__ = "note_images"
    __table_args__ = (Index("ix_note_images_note", "note_id"),)

    note_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("notes.id", ondelete="CASCADE"),
        nullable=False,
    )
    filename: Mapped[str | None] = mapped_column(Text)
    content_type: Mapped[str | None] = mapped_column(Text)
    sort_order: Mapped[int] = mapped_column(Integer, server_default="0", nullable=False)
