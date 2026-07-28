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
"""

from datetime import datetime

from sqlalchemy import CheckConstraint, DateTime, Integer, Text, func
from sqlalchemy.orm import Mapped, mapped_column

from wild_life.db.base import Base


class Whiteboard(Base):
    __tablename__ = "whiteboard"
    __table_args__ = (CheckConstraint("id = 1", name="ck_whiteboard_single_row"),)
    __audit__ = False

    id: Mapped[int] = mapped_column(Integer, primary_key=True, default=1)
    content: Mapped[str] = mapped_column(Text, nullable=False, server_default="")
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        server_default=func.now(),
        onupdate=func.now(),
        nullable=False,
    )
