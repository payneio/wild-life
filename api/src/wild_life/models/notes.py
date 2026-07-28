"""Note — an observation about a subject, at a time.

``entity_type``/``entity_id`` are a soft polymorphic link (no DB FK, since the
target may be any table) naming *what the note is about*. Every note has one: the
self Person is a subject like any other, so the journal is "my observations about
myself" the same way a note on Brian is my observations about Brian. That is why
``entity_type IS NULL`` can mean exactly one thing — captured without saying what
it is about — which is the inbox.

There is deliberately no genre column. What used to be `note_type` only ever
restated the root (journal → me, meeting → the event, note → the thing), and
documents are not stored in this app at all. ``entry_date`` places the note in
time; ``NoteMention`` records what else it touches.
"""

import uuid
from datetime import date

from sqlalchemy import Date, ForeignKey, Index, Integer, Text
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column

from wild_life.db.base import Base
from wild_life.models.mixins import TimestampMixin, UUIDPrimaryKey


class Note(UUIDPrimaryKey, TimestampMixin, Base):
    __tablename__ = "notes"
    # GIN trigram indexes for the journal's ILIKE '%x%' search (added in
    # d4e5f6a7b8c9). Declared here, not just in the migration, so autogenerate
    # stops proposing to drop the two indexes it couldn't see.
    __table_args__ = (
        Index(
            "ix_notes_body_trgm",
            "body",
            postgresql_using="gin",
            postgresql_ops={"body": "gin_trgm_ops"},
        ),
        Index(
            "ix_notes_title_trgm",
            "title",
            postgresql_using="gin",
            postgresql_ops={"title": "gin_trgm_ops"},
        ),
    )

    title: Mapped[str | None] = mapped_column(Text)
    body: Mapped[str] = mapped_column(Text, nullable=False, server_default="")
    entry_date: Mapped[date | None] = mapped_column(Date, index=True)
    mood: Mapped[str | None] = mapped_column(Text)
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
