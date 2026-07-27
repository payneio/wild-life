"""Tasks carry a rank among their siblings.

The board had no order to show. Every open task shares the same sort key —
`priority` is the default on all of them and almost none carry a due date — and
`list_tasks` issues no ORDER BY, so what you saw was whatever Postgres handed
back. Ranking replaces that with a judgment you can actually make: drag a task
up and the list means something.

Seeded from the order the API used to derive, so nothing jumps on first load.

Revision ID: c6d7e8f9a0b1
Revises: b5c6d7e8f9a0
"""

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op

revision: str = "c6d7e8f9a0b1"
down_revision: str | None = "b5c6d7e8f9a0"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None

SCHEMA = "wild_life"
# Siblings start a comfortable distance apart, so the first few dozen reorders
# are plain midpoints and never need a respace.
GAP = 1024.0


def upgrade() -> None:
    op.add_column(
        "tasks",
        sa.Column("position", sa.Float(), nullable=True),
        schema=SCHEMA,
    )
    # Partitioned by the parent, which is now exactly one column per task —
    # `coalesce` is unambiguous because `ck_tasks_single_parent` says so. The
    # ordering restates what `list_tasks` computed in Python, so the first render
    # after this migration is the order you were already looking at.
    op.execute(
        sa.text(f"""
        UPDATE {SCHEMA}.tasks t
        SET position = s.pos
        FROM (
            SELECT id,
                   row_number() OVER (
                       PARTITION BY coalesce(project_id, program_id, area_id)
                       ORDER BY
                           CASE priority
                               WHEN 'urgent' THEN 0
                               WHEN 'high'   THEN 1
                               WHEN 'medium' THEN 2
                               WHEN 'low'    THEN 3
                               ELSE 4
                           END,
                           due_date ASC NULLS LAST,
                           created_at ASC
                   ) * {GAP} AS pos
            FROM {SCHEMA}.tasks
        ) s
        WHERE s.id = t.id
        """)
    )
    op.alter_column(
        "tasks", "position", nullable=False, server_default="0", schema=SCHEMA
    )
    op.create_index("ix_wild_life_tasks_position", "tasks", ["position"], schema=SCHEMA)


def downgrade() -> None:
    op.drop_index("ix_wild_life_tasks_position", table_name="tasks", schema=SCHEMA)
    op.drop_column("tasks", "position", schema=SCHEMA)
