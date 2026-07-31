"""How an intention meets a moment, and how a means meets an end.

`docs/model.md` A4 and A9. Both relations existed before this — as a naming
convention. A task's completion moment was called `task:<id>:completion`, so
asking "did this intention happen" meant `replace(source_ref, ':work',
':completion')`: a string transformation standing in for a join. It could not be
indexed, could not be constrained, and broke if anything renamed.

Two edges, because they relate different things.

**`IntentionMoment` — what a moment did to an intention.** M:N in both
directions, which is the property that made the single-row model unworkable: one
Saturday errand discharges three commitments, and one meeting generates two. A
row carries `discharges` or `generates`; the first is the audit's numerator and
the second is its denominator, and neither is derivable from the other.

**`TaskObjective` — what a task is for.** A9: contribution is not satisfaction.
An objective is satisfied when its claim holds, never by its contributing tasks
completing — drafting, editing and submitting do not publish the paper. So this
edge answers "what is left before X" and deliberately answers nothing about
whether X is true.

Both are soft on the intention side (`intention_type`/`intention_id`) because an
intention has two species living in two tables, for the reason the model gives:
their payloads differ enough that one table would be half nulls.
"""

import uuid

from sqlalchemy import ForeignKey, Index, Text, UniqueConstraint
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column

from wild_life.db.base import Base
from wild_life.models.mixins import TimestampMixin, UUIDPrimaryKey


class IntentionMoment(UUIDPrimaryKey, TimestampMixin, Base):
    """An edge between a commitment and something that happened."""

    __tablename__ = "intention_moments"
    __table_args__ = (
        UniqueConstraint(
            "intention_type",
            "intention_id",
            "moment_id",
            "role",
            name="uq_intention_moment_edge",
        ),
        Index("ix_intention_moments_intention", "intention_type", "intention_id"),
        Index("ix_intention_moments_moment", "moment_id"),
    )

    #: `task` or `outcome`. Soft, because the two species live in two tables.
    intention_type: Mapped[str] = mapped_column(Text, nullable=False)
    intention_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), nullable=False)
    #: Hard: a moment is one table, and an edge to a deleted one is meaningless.
    moment_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("moments.id", ondelete="CASCADE"), nullable=False
    )
    #: `discharges` — this act satisfied the commitment.
    #: `generates`  — this act is where the commitment came from.
    role: Mapped[str] = mapped_column(Text, nullable=False)


class TaskObjective(UUIDPrimaryKey, TimestampMixin, Base):
    """A means-end edge: this task is done in service of that objective."""

    __tablename__ = "task_objectives"
    __table_args__ = (
        UniqueConstraint("task_id", "outcome_id", name="uq_task_objective"),
        Index("ix_task_objectives_outcome", "outcome_id"),
    )

    task_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("tasks.id", ondelete="CASCADE"), nullable=False
    )
    outcome_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("outcomes.id", ondelete="CASCADE"),
        nullable=False,
    )
