"""Whiteboard — one scratch buffer, deliberately not an entity.

A singular space to mess around in: no subject, no date, no identity, no history.
That is what makes it *not* a Note. A Note is an observation about something at a
time; a scratch buffer is neither, and modelling it as a sentinel Note row would
mean excluding that row from the journal, corpus search, backlinks, the inbox, the
calendar note source and mention resolution — six places that would have to
remember it forever.

So it sits outside the entity model entirely: absent from ``EntityType``, from the
frontend registry, and — via ``__audit__ = False`` — from ``change_log`` and the
live stream. A buffer written on every debounced keystroke has no business in a
history feed of domain changes.

One row, always. ``id`` is fixed at 1 by a check constraint rather than by
convention, so a second row is a database error instead of a silent bug.

Two things here are *not* history in the sense the paragraph above denies it.
``version`` is a write token, not a past: a writer echoes back the version it
read, and a mismatch means it is writing over something it never saw. And
``WhiteboardRevision`` keeps the displaced text so that such a write — or an
ordinary one you regret — is recoverable. Neither gives the buffer an identity,
a subject or a place in the timeline, which is what the exclusions are about.
"""

from datetime import datetime

from sqlalchemy import CheckConstraint, DateTime, Index, Integer, Text, func, text
from sqlalchemy.orm import Mapped, mapped_column

from wild_life.db.base import Base
from wild_life.models.mixins import UUIDPrimaryKey


class Whiteboard(Base):
    __tablename__ = "whiteboard"
    __table_args__ = (CheckConstraint("id = 1", name="ck_whiteboard_single_row"),)
    __audit__ = False

    id: Mapped[int] = mapped_column(Integer, primary_key=True, default=1)
    content: Mapped[str] = mapped_column(Text, nullable=False, server_default="")
    # Bumped on every write. An integer rather than ``updated_at`` because a
    # precondition asks *which* version, not *when* — and two writes inside one
    # clock tick share a timestamp while they cannot share a counter.
    version: Mapped[int] = mapped_column(Integer, nullable=False, server_default="0")
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        server_default=func.now(),
        onupdate=func.now(),
        nullable=False,
    )


class WhiteboardRevision(Base, UUIDPrimaryKey):
    """Text the buffer used to hold, kept so that a write is not a shredder.

    Written *before* an overwrite, and only when the standing content is older
    than one editing session — a debounced buffer writes on every keystroke, so
    snapshotting per write would keep the last four seconds of typing and
    nothing you would ever want back. One snapshot per session keeps months.
    """

    __tablename__ = "whiteboard_revisions"
    # Every read is "most recently displaced first", and so is the prune.
    __table_args__ = (
        Index("ix_whiteboard_revisions_replaced_at", text("replaced_at DESC")),
    )
    __audit__ = False

    content: Mapped[str] = mapped_column(Text, nullable=False)
    # The version this content *was*, so a revision can be named by what it
    # replaced rather than by its position in a list.
    version: Mapped[int] = mapped_column(Integer, nullable=False)
    # When it stopped being the buffer, which is the only date a person asks for.
    replaced_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        server_default=func.now(),
        nullable=False,
    )
