"""Core hierarchy: Area -> (Program) -> Project."""

import uuid
from datetime import date, datetime

from sqlalchemy import Date, DateTime, ForeignKey, Text
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column

from personal_api.db.base import Base
from personal_api.models.mixins import TimestampMixin, UUIDPrimaryKey


def _person_fk() -> Mapped[uuid.UUID | None]:
    return mapped_column(
        UUID(as_uuid=True), ForeignKey("people.id", ondelete="SET NULL"), index=True
    )


class Area(UUIDPrimaryKey, TimestampMixin, Base):
    """An ongoing sphere of responsibility with no natural completion date."""

    __tablename__ = "areas"

    name: Mapped[str] = mapped_column(Text, nullable=False)
    description: Mapped[str | None] = mapped_column(Text)
    status: Mapped[str] = mapped_column(
        Text, server_default="active", nullable=False
    )  # active/inactive/archived
    desired_standard: Mapped[str | None] = mapped_column(Text)
    review_frequency: Mapped[str | None] = mapped_column(Text)  # weekly/monthly/...
    accountable_owner_id: Mapped[uuid.UUID | None] = _person_fk()
    responsible_lead_id: Mapped[uuid.UUID | None] = _person_fk()
    notes: Mapped[str | None] = mapped_column(Text)
    archived_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))


class Program(UUIDPrimaryKey, TimestampMixin, Base):
    """A long-running effort to improve or transform an area."""

    __tablename__ = "programs"

    name: Mapped[str] = mapped_column(Text, nullable=False)
    description: Mapped[str | None] = mapped_column(Text)
    area_id: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True), ForeignKey("areas.id", ondelete="SET NULL"), index=True
    )
    intended_outcome: Mapped[str | None] = mapped_column(Text)
    success_criteria: Mapped[str | None] = mapped_column(Text)
    status: Mapped[str] = mapped_column(
        Text, server_default="proposed", nullable=False
    )  # proposed/active/paused/completed/cancelled
    start_date: Mapped[date | None] = mapped_column(Date)
    target_date: Mapped[date | None] = mapped_column(Date)
    accountable_owner_id: Mapped[uuid.UUID | None] = _person_fk()
    responsible_lead_id: Mapped[uuid.UUID | None] = _person_fk()
    review_frequency: Mapped[str | None] = mapped_column(Text)
    reporting_cadence: Mapped[str | None] = mapped_column(Text)
    notes: Mapped[str | None] = mapped_column(Text)


class Project(UUIDPrimaryKey, TimestampMixin, Base):
    """A finite, multi-step effort with a defined outcome."""

    __tablename__ = "projects"

    name: Mapped[str] = mapped_column(Text, nullable=False)
    description: Mapped[str | None] = mapped_column(Text)
    area_id: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True), ForeignKey("areas.id", ondelete="SET NULL"), index=True
    )
    program_id: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True), ForeignKey("programs.id", ondelete="SET NULL"), index=True
    )
    intended_outcome: Mapped[str | None] = mapped_column(Text)
    completion_criteria: Mapped[str | None] = mapped_column(Text)
    status: Mapped[str] = mapped_column(
        Text, server_default="proposed", nullable=False
    )  # proposed/active/waiting/paused/completed/cancelled
    priority: Mapped[str] = mapped_column(
        Text, server_default="medium", nullable=False
    )  # low/medium/high/urgent
    start_date: Mapped[date | None] = mapped_column(Date)
    target_date: Mapped[date | None] = mapped_column(Date)
    accountable_owner_id: Mapped[uuid.UUID | None] = _person_fk()
    responsible_lead_id: Mapped[uuid.UUID | None] = _person_fk()
    next_action: Mapped[str | None] = mapped_column(Text)
    last_activity_date: Mapped[date | None] = mapped_column(Date)
    notes: Mapped[str | None] = mapped_column(Text)


class ProjectContributor(Base):
    """Join: people contributing to a project."""

    __tablename__ = "project_contributors"

    project_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("projects.id", ondelete="CASCADE"),
        primary_key=True,
    )
    person_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("people.id", ondelete="CASCADE"),
        primary_key=True,
    )
