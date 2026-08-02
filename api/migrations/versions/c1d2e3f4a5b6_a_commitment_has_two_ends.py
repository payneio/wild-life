"""A commitment has two ends, and an occurrence has none.

`docs/model.md` A2. The window moves to where the axiom always put it — on the
intention — and leaves the occurrence, where it never meant anything.

**`not_before` is the missing half of a commitment's window.** A deadline is
one-sided by construction, so nothing could say "the tax return cannot start
until the K-1 arrives in mid-February, and must be filed by April 15". A future
`scheduled_date` is not the same claim: that says *I plan to work on it then*,
and if the K-1 arrives early the task should become available rather than stay
hidden until an arbitrary day someone picked. Nothing in `tasks` could express an
earliest bound at all — `blocked_by_task_id` waits on another task and
`waiting_on` is free text, and both are unused.

It also makes a soft season honest. "Redo the deck sometime this summer" is
`not_before` June 1, `due_date` August 31 — where a deadline alone had to lie,
reporting overdue on September 1 for something nothing bad happened to.

**And the windows leave `moments`.** They were on the occurrence, where a window
is meaningless: a thing that happened happened at a time. Every one of the 485
was zero-width, and the writers that produced them were fed single dates and
could not have produced anything else — which is why "no writer ever wanted a
wide one" was never evidence about the need.

The 402 `work` moments go with them. A scheduled task *is* the intention; the
shadow moment restated `tasks.scheduled_date` in a second place, which is the
duplication this model exists to remove. Its completion counterpart stays,
because finishing is an occurrence and belongs on the spine.

Revision ID: c1d2e3f4a5b6
Revises: 6749fd6aae93
"""

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op

revision: str = "c1d2e3f4a5b6"
down_revision: str | None = "6749fd6aae93"
branch_labels: Sequence[str] | None = None
depends_on: Sequence[str] | None = None


def upgrade() -> None:
    # The earliest end of a commitment's window. `due_date` / `by_when` is
    # already the latest; narrowing is these two closing on each other, which is
    # what "increasing definition" means when it is a mechanism rather than a
    # metaphor.
    op.add_column(
        "tasks", sa.Column("not_before", sa.Date(), nullable=True), schema="wild_life"
    )
    op.add_column(
        "outcomes",
        sa.Column("not_before", sa.Date(), nullable=True),
        schema="wild_life",
    )

    # A scheduled task is the intention; the shadow moment said it twice.
    op.execute("DELETE FROM wild_life.moments WHERE kind = 'work'")

    for col in ("window_start", "window_end", "expected_minutes"):
        op.drop_column("moments", col, schema="wild_life")


def downgrade() -> None:
    """Restores the columns, not the 402 moments.

    Those were derived from `tasks.scheduled_date` and are re-derivable from it;
    reconstructing them here would be a second writer for a fact that has one.
    """
    op.add_column(
        "moments",
        sa.Column("window_start", sa.DateTime(timezone=True), nullable=True),
        schema="wild_life",
    )
    op.add_column(
        "moments",
        sa.Column("window_end", sa.DateTime(timezone=True), nullable=True),
        schema="wild_life",
    )
    op.add_column(
        "moments",
        sa.Column("expected_minutes", sa.Integer(), nullable=True),
        schema="wild_life",
    )
    op.drop_column("outcomes", "not_before", schema="wild_life")
    op.drop_column("tasks", "not_before", schema="wild_life")
