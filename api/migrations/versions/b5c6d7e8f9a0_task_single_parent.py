"""A task hangs off one rung of the hierarchy, not three.

Tasks carried `area_id`, `program_id` and `project_id` at once, the outer two
copied down at creation and never refreshed. They rotted: 17 tasks disagreed
with their project's area and 14 with its program — always a task re-filed onto
a different project while the cached copy stayed where it was.

Drops the redundant copies and forbids the arrangement that produced them. A
task with no parent at all is left alone: capture takes a title and nothing
else, so unfiled is the designed inbox state.

Must run after a4b5c6d7e8f9 — 69 tasks pointed at a project that had no program
of its own, and those only become redundant once the project has one.

Revision ID: b5c6d7e8f9a0
Revises: a4b5c6d7e8f9
"""

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op

revision: str = "b5c6d7e8f9a0"
down_revision: str | None = "a4b5c6d7e8f9"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None

SCHEMA = "wild_life"


def upgrade() -> None:
    # Tightest link wins, which is also the one the user last chose: filing a
    # task onto a project is a deliberate act, while the area on it is whatever
    # was copied down months ago.
    op.execute(
        sa.text(f"""
        UPDATE {SCHEMA}.tasks
        SET area_id = NULL, program_id = NULL
        WHERE project_id IS NOT NULL
          AND (area_id IS NOT NULL OR program_id IS NOT NULL)
        """)
    )
    op.execute(
        sa.text(f"""
        UPDATE {SCHEMA}.tasks
        SET area_id = NULL
        WHERE project_id IS NULL
          AND program_id IS NOT NULL
          AND area_id IS NOT NULL
        """)
    )
    op.create_check_constraint(
        "ck_tasks_single_parent",
        "tasks",
        "num_nonnulls(area_id, program_id, project_id) <= 1",
        schema=SCHEMA,
    )


def downgrade() -> None:
    # The constraint comes off; the nulled copies do not come back. They were
    # duplicates of the surviving link where they agreed with it, and wrong
    # where they did not, so there is nothing here worth restoring. Re-deriving
    # them is `UPDATE tasks SET area_id = <project's program's area>` if some
    # future caller genuinely wants the cache again.
    op.drop_constraint("ck_tasks_single_parent", "tasks", schema=SCHEMA, type_="check")
