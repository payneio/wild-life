"""Protocol — a named recurring plan that bundles routines toward an outcome.

Not a health object, though health is where they started. A program's effort is
either finite (Project → Task) or repeating (Protocol → Routine), so a protocol
is the recurring counterpart to a project and belongs to any program: a
medication regimen, a review ritual, a training block.
"""

import uuid
from datetime import date

from sqlalchemy import Boolean, Date, ForeignKey, Text
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column

from wild_life.db.base import Base
from wild_life.models.mixins import TimestampMixin, UUIDPrimaryKey


class Protocol(UUIDPrimaryKey, TimestampMixin, Base):
    """A named recurring plan bundling steps (Routines).

    Lifecycle derives from the window: ``planned`` (start in the future), ``active``
    (in-window), ``completed`` (past end). ``paused`` is the one non-derivable state —
    a deliberate suspension inside the window — and the only stored lifecycle bit.
    """

    __tablename__ = "protocols"

    name: Mapped[str] = mapped_column(Text, nullable=False)
    category: Mapped[str | None] = mapped_column(Text)
    intended_outcome: Mapped[str | None] = mapped_column(Text)
    paused: Mapped[bool] = mapped_column(
        Boolean, server_default="false", nullable=False
    )
    # The program it serves. There is no `area_id` beside it: every protocol had
    # one and none had an area without a program, so it only ever restated what
    # the program already says.
    program_id: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True), ForeignKey("programs.id", ondelete="SET NULL"), index=True
    )
    start_date: Mapped[date | None] = mapped_column(Date)
    end_date: Mapped[date | None] = mapped_column(Date)
    duration: Mapped[str | None] = mapped_column(Text)  # e.g. "4-6 wk"
    # Unindexed, as it has always been — protocols are few and never looked up
    # by provider.
    provider_id: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True), ForeignKey("people.id", ondelete="SET NULL")
    )
    notes: Mapped[str | None] = mapped_column(Text)
