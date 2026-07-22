"""Goal — a desired result that provides direction."""

import uuid
from datetime import date

from sqlalchemy import Date, Float, ForeignKey, Text
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column

from wild_life.db.base import Base
from wild_life.models.mixins import TimestampMixin, UUIDPrimaryKey


class Goal(UUIDPrimaryKey, TimestampMixin, Base):
    __tablename__ = "goals"

    name: Mapped[str] = mapped_column(Text, nullable=False)
    description: Mapped[str | None] = mapped_column(Text)
    area_id: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True), ForeignKey("areas.id", ondelete="SET NULL"), index=True
    )
    program_id: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True), ForeignKey("programs.id", ondelete="SET NULL"), index=True
    )
    metric_id: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True), ForeignKey("metrics.id", ondelete="SET NULL")
    )
    condition_id: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True), ForeignKey("conditions.id", ondelete="SET NULL"), index=True
    )  # a health goal targets a condition
    target_state: Mapped[str | None] = mapped_column(Text)
    target_value: Mapped[float | None] = mapped_column(Float)
    baseline: Mapped[float | None] = mapped_column(Float)
    target_date: Mapped[date | None] = mapped_column(Date)
    status: Mapped[str] = mapped_column(
        Text, server_default="active", nullable=False
    )  # active/achieved/paused/dropped
    # Manual progress 0..100; may also be derived from metrics/projects.
    progress: Mapped[float | None] = mapped_column(Float)
    measurement_method: Mapped[str | None] = mapped_column(Text)
    notes: Mapped[str | None] = mapped_column(Text)


class GoalProject(Base):
    """Join: goals may be advanced by multiple projects."""

    __tablename__ = "goal_projects"

    goal_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("goals.id", ondelete="CASCADE"), primary_key=True
    )
    project_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("projects.id", ondelete="CASCADE"),
        primary_key=True,
    )
