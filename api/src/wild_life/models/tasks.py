"""Task — a discrete action that can be completed."""

import uuid
from datetime import date, datetime, time

from sqlalchemy import (
    Boolean,
    CheckConstraint,
    Date,
    DateTime,
    Float,
    ForeignKey,
    Integer,
    Text,
    Time,
)
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column

from wild_life.db.base import Base
from wild_life.models.mixins import TimestampMixin, UUIDPrimaryKey

# A task hangs off exactly one rung of Area → Program → Project, or off none at
# all while it is still in the inbox. Not "exactly one": capture takes a title
# and nothing else, so unfiled is a designed state, not a defect.
#
# Enforced in the database rather than trusted to the writers, because the
# writers are what broke it. Carrying a project *and* a cached area/program let
# the copies rot — 17 tasks disagreed with their project's area and 14 with its
# program, always because the task was re-filed and the copy stayed put. With a
# single link there is no second copy to go stale, and the area is a join away.
SINGLE_PARENT = CheckConstraint(
    "num_nonnulls(area_id, program_id, project_id) <= 1",
    name="ck_tasks_single_parent",
)


class Task(UUIDPrimaryKey, TimestampMixin, Base):
    __tablename__ = "tasks"
    __table_args__ = (SINGLE_PARENT,)

    title: Mapped[str] = mapped_column(Text, nullable=False)
    description: Mapped[str | None] = mapped_column(Text)
    status: Mapped[str] = mapped_column(
        Text, server_default="inbox", nullable=False
    )  # inbox/planned/in_progress/waiting/delegated/delivered/completed/cancelled
    area_id: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True), ForeignKey("areas.id", ondelete="SET NULL"), index=True
    )
    program_id: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True), ForeignKey("programs.id", ondelete="SET NULL"), index=True
    )
    project_id: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True), ForeignKey("projects.id", ondelete="SET NULL"), index=True
    )
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
    claimed_by_id: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True), ForeignKey("people.id", ondelete="SET NULL"), index=True
    )
    claimed_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
