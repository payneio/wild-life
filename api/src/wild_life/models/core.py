"""Core hierarchy: Area -> (Program) -> Project."""

import uuid
from datetime import date, datetime

from sqlalchemy import Date, DateTime, ForeignKey, Text
from sqlalchemy.dialects.postgresql import ARRAY, UUID
from sqlalchemy.orm import Mapped, mapped_column

from wild_life.db.base import Base
from wild_life.models.mixins import TimestampMixin, UUIDPrimaryKey


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
    intended_outcome: Mapped[str | None] = mapped_column(Text)
    review_frequency: Mapped[str | None] = mapped_column(Text)  # weekly/monthly/...
    accountable_owner_id: Mapped[uuid.UUID | None] = _person_fk()
    responsible_lead_id: Mapped[uuid.UUID | None] = _person_fk()
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
    status: Mapped[str] = mapped_column(
        Text, server_default="proposed", nullable=False
    )  # ProgramStatus
    start_date: Mapped[date | None] = mapped_column(Date)
    # When it stopped being a thing. Replaces `target_date`, which no program ever
    # carried — a program is something you pay attention to, not a dated effort.
    ended_date: Mapped[date | None] = mapped_column(Date)
    accountable_owner_id: Mapped[uuid.UUID | None] = _person_fk()
    responsible_lead_id: Mapped[uuid.UUID | None] = _person_fk()
    review_frequency: Mapped[str | None] = mapped_column(Text)
    reporting_cadence: Mapped[str | None] = mapped_column(Text)
    # Health facet — null for programs that aren't conditions.
    category: Mapped[str | None] = mapped_column(Text)  # HealthCategory
    # What kinds of thing this program concerns itself with. A fact about the
    # program ("IMO involves medications"), which the detail reads to decide
    # whether to offer an *empty* panel. A panel with rows always shows.
    involves: Mapped[list[str]] = mapped_column(
        ARRAY(Text), server_default="{}", nullable=False
    )


class Project(UUIDPrimaryKey, TimestampMixin, Base):
    """A finite, multi-step effort with a defined outcome."""

    __tablename__ = "projects"

    name: Mapped[str] = mapped_column(Text, nullable=False)
    description: Mapped[str | None] = mapped_column(Text)
    # The program it serves — the project's one and only parent, the way a
    # protocol's is. There is no `area_id` beside it: every project that had a
    # program agreed with that program's area in all 25 rows, and the 11 that
    # had none were one area's pre-reorg residue (ten of them archived). So the
    # column only ever restated what the program already says, from a copy taken
    # at creation that nothing refreshed — the same arrangement one level down,
    # on Task, had already drifted.
    #
    # RESTRICT, not SET NULL: with the column non-null there is nothing to set
    # it to, and a program holding projects should refuse to vanish rather than
    # take them with it. `main.py` turns the violation into a 409.
    program_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("programs.id", ondelete="RESTRICT"),
        index=True,
        nullable=False,
    )
    intended_outcome: Mapped[str | None] = mapped_column(Text)
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
