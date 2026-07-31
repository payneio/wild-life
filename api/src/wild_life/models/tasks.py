"""Task — a discrete action that can be completed."""

import uuid
from datetime import date, datetime, time

from sqlalchemy import (
    Boolean,
    Date,
    DateTime,
    Float,
    ForeignKey,
    Index,
    Integer,
    Text,
    Time,
    UniqueConstraint,
)
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column

from wild_life.db.base import Base
from wild_life.models.mixins import TimestampMixin, UUIDPrimaryKey

# A task hangs off exactly one rung of Area → Program → Project, or off none at
# all while it is still in the inbox. Not "exactly one": capture takes a title
# and nothing else, so unfiled is a designed state, not a defect.
class Task(UUIDPrimaryKey, TimestampMixin, Base):
    __tablename__ = "tasks"


    title: Mapped[str] = mapped_column(Text, nullable=False)
    description: Mapped[str | None] = mapped_column(Text)
    status: Mapped[str] = mapped_column(
        Text, server_default="inbox", nullable=False
    )  # inbox/planned/in_progress/waiting/delegated/delivered/completed/cancelled
    # The one scope this task sits in, at whatever altitude — `area`, `program`
    # or `project`. One reference, not three nullable ones: with three, a task
    # carrying a project *and* a cached area let the copies rot (17 disagreed
    # with their project's area, 14 with its program, always after a re-file),
    # which needed a CHECK constraint to forbid what the representation should
    # never have allowed. A single pair cannot disagree with itself, so the
    # constraint is gone rather than enforced.
    #
    # Soft, like `outcomes.entity_type`/`entity_id`, because the altitude varies
    # and a foreign key cannot. The three it replaces were `SET NULL`, which
    # silently orphaned a task when its project was deleted; the router refuses
    # the delete instead.
    scope_type: Mapped[str | None] = mapped_column(Text)
    scope_id: Mapped[uuid.UUID | None] = mapped_column(UUID(as_uuid=True))
    priority: Mapped[str] = mapped_column(
        Text, server_default="medium", nullable=False
    )  # low/medium/high/urgent
    # Where this sits among its siblings — the tasks under the same parent.
    #
    # An ordinal judgment, and the only one the app asks for. Inside a project
    # nothing is urgent (urgency arrives from outside, as a due date), so the
    # order you drag things into *is* your importance ranking, expressed without
    # having to name an axis or keep two attributes current.
    #
    # A float rather than a contiguous integer so a reorder writes one row: the
    # new position is the midpoint of its neighbours. `_rebalance` respaces a
    # sibling set when the midpoints get too close to split.
    position: Mapped[float] = mapped_column(
        Float, server_default="0", nullable=False, index=True
    )
    accountable_owner_id: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True), ForeignKey("people.id", ondelete="SET NULL")
    )
    responsible_id: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True), ForeignKey("people.id", ondelete="SET NULL")
    )
    assignee_id: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True), ForeignKey("people.id", ondelete="SET NULL"), index=True
    )
    due_date: Mapped[date | None] = mapped_column(Date)
    scheduled_date: Mapped[date | None] = mapped_column(Date)
    # Optional time-of-day for calendar time-blocking; with estimated_minutes it
    # renders as a timed block, else the task is an all-day chip on scheduled_date.
    scheduled_time: Mapped[time | None] = mapped_column(Time)
    estimated_minutes: Mapped[int | None] = mapped_column(Integer)
    recurrence: Mapped[str | None] = mapped_column(Text)  # daily/weekly/monthly/...
    blocked_by_task_id: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True), ForeignKey("tasks.id", ondelete="SET NULL")
    )
    waiting_on: Mapped[str | None] = mapped_column(Text)
    acceptance_required: Mapped[bool] = mapped_column(
        Boolean, server_default="false", nullable=False
    )
    completed_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    # Cooperative claim so exactly one worker/agent works a task at a time.
    # A lock, not an assignment: infrastructure rather than an ask.
    claimed_by_id: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True), ForeignKey("people.id", ondelete="SET NULL"), index=True
    )
    claimed_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))


class Dependency(UUIDPrimaryKey, TimestampMixin, Base):
    """ "This cannot start until that is done" — an edge, because it is one.

    Replaces two mechanisms that could each say less than the truth:
    ``Task.blocked_by_task_id`` allowed exactly one blocker, and ``waiting_on``
    was free text, invisible to any planner. Real work is blocked by several
    things at once, and a dependency is the one planning constraint that is
    inherently relational — which is why the bounds (``due``, ``not_before``)
    stay typed columns while this is a table.

    Both ends are soft-polymorphic: a task can wait on another task today, and on
    a moment (an appointment that has to happen first) once intentions are rows.
    """

    __tablename__ = "dependencies"
    __table_args__ = (
        UniqueConstraint(
            "dependent_type",
            "dependent_id",
            "blocker_type",
            "blocker_id",
            name="uq_dependencies_edge",
        ),
        Index("ix_dependencies_blocker", "blocker_type", "blocker_id"),
    )

    dependent_type: Mapped[str] = mapped_column(Text, nullable=False)
    dependent_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), nullable=False)
    blocker_type: Mapped[str] = mapped_column(Text, nullable=False)
    blocker_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), nullable=False)
