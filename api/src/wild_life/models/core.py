"""Attention — the scopes you allocate finite regard to.

Area -> Program -> Project, nesting one parent each. See `docs/domain.md`; the
definitions that decide which rung a thing belongs on are:

- **Area** — *a standard you maintain indefinitely, not a goal you complete*
  (GTD's Areas of Focus & Responsibility). If it can be finished it is not an
  area. Areas never end, which is why they attract standing claims rather than
  objectives that get satisfied.
- **Program** — a sustained effort inside an area, with a start and an expected
  end. Where an area is a standard, a program is a campaign to move one.
- **Project** — a bounded, finishable piece of work inside a program.

Every rung carries `review_frequency`, because the failure this cluster exists to
make visible is *a scope unexamined past its cadence* — which is a different
failure from anything being overdue, and is why attention is modelled separately
from intention at all.

`accountable_owner_id` and `responsible_lead_id` are RACI's A and R. Delegation
moves Responsible; Accountable does not move.

`Project.last_activity_date` records **activity, not examination**: a project can
look alive because something touched it and still be unexamined.
"""

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
    purpose: Mapped[str | None] = mapped_column(Text)
    status: Mapped[str] = mapped_column(Text, server_default="active", nullable=False)
    review_frequency: Mapped[str | None] = mapped_column(Text)  # weekly/monthly/...
    accountable_owner_id: Mapped[uuid.UUID | None] = _person_fk()
    responsible_lead_id: Mapped[uuid.UUID | None] = _person_fk()
    archived_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))


class Program(UUIDPrimaryKey, TimestampMixin, Base):
    """A long-running effort to improve or transform an area."""

    __tablename__ = "programs"

    name: Mapped[str] = mapped_column(Text, nullable=False)
    purpose: Mapped[str | None] = mapped_column(Text)
    area_id: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True), ForeignKey("areas.id", ondelete="SET NULL"), index=True
    )
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
    purpose: Mapped[str | None] = mapped_column(Text)
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
    # How often this project expects to be *examined*. Distinct from
    # `last_activity_date`, which says whether work happened inside it — a
    # project can be busy and unattended, and that is the neglect worth
    # reporting. Usually null: cadence inherits from the program above (A10).
    review_frequency: Mapped[str | None] = mapped_column(Text)


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
