"""Routine — recurring behavior/maintenance — and its completable instances."""

import uuid
from datetime import date, datetime

from sqlalchemy import Date, DateTime, ForeignKey, Text
from sqlalchemy.dialects.postgresql import ARRAY, UUID
from sqlalchemy.orm import Mapped, mapped_column

from personal_api.db.base import Base
from personal_api.models.mixins import TimestampMixin, UUIDPrimaryKey


class Routine(UUIDPrimaryKey, TimestampMixin, Base):
    __tablename__ = "routines"

    name: Mapped[str] = mapped_column(Text, nullable=False)
    area_id: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True), ForeignKey("areas.id", ondelete="SET NULL"), index=True
    )
    program_id: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True), ForeignKey("programs.id", ondelete="SET NULL"), index=True
    )
    frequency: Mapped[str | None] = mapped_column(Text)  # daily/weekly/3x-week/monthly
    preferred_days: Mapped[list[str]] = mapped_column(ARRAY(Text), server_default="{}")
    preferred_time: Mapped[str | None] = mapped_column(Text)
    tracking_method: Mapped[str | None] = mapped_column(Text)
    start_date: Mapped[date | None] = mapped_column(Date)
    end_date: Mapped[date | None] = mapped_column(Date)
    responsible_id: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True), ForeignKey("people.id", ondelete="SET NULL")
    )
    status: Mapped[str] = mapped_column(
        Text, server_default="active", nullable=False
    )  # active/paused/archived
    notes: Mapped[str | None] = mapped_column(Text)


class RoutineInstance(UUIDPrimaryKey, TimestampMixin, Base):
    """A single scheduled/completed occurrence of a routine (preserves history)."""

    __tablename__ = "routine_instances"

    routine_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("routines.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    scheduled_date: Mapped[date] = mapped_column(Date, nullable=False, index=True)
    status: Mapped[str] = mapped_column(
        Text, server_default="pending", nullable=False
    )  # pending/done/skipped
    completed_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    notes: Mapped[str | None] = mapped_column(Text)
