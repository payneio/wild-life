"""A task names exactly one scope, once.

`docs/model.md` A2. Every rung of the attention hierarchy names its parent with
one foreign key — a program its area, a project its program — except `tasks`,
which named it with three nullable ones and let the caller pick an altitude by
which column it filled.

The cost was not hypothetical. Finding the tasks under an area took a three-way
disjunction (`hierarchy.py`), finding a task's siblings took a three-branch
coalesce (`ranking.py`), and the review dashboard unioned three queries and said
so in a comment. Nothing prevented a task naming program X while its project
belonged to program Y.

This is the same fix the model already applied one rung up. `Project.program_id`
carries the note: *"every project that had a program agreed with that program's
area in all 25 rows … the column only ever restated what the program already
says, from a copy taken at creation that nothing refreshed — the same arrangement
one level down, on Task, had already drifted."* This is that level down.

**Polymorphic rather than a single FK to project**, because attaching at any
altitude is a requirement rather than debt: a single action inside an area of
responsibility genuinely has no project, and forcing one would mean inventing a
container to hold one task. The shape matches `outcomes.entity_type`/`entity_id`,
documented as existing to avoid exactly these three nullable FKs.

The foreign keys are upgraded rather than lost: all three were `SET NULL`, so
deleting a project already orphaned its tasks silently, leaving them attached to
nothing and violating the invariant this establishes. The router refuses now, the
way a program holding projects refuses to vanish.

Revision ID: c9d8e7f6a5b4
Revises: a1b2c3d4e5f6
"""

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op

revision: str = "c9d8e7f6a5b4"
down_revision: str | None = "a1b2c3d4e5f6"
branch_labels: Sequence[str] | None = None
depends_on: Sequence[str] | None = None


def upgrade() -> None:
    op.add_column(
        "tasks", sa.Column("scope_type", sa.Text(), nullable=True), schema="wild_life"
    )
    op.add_column(
        "tasks", sa.Column("scope_id", sa.UUID(), nullable=True), schema="wild_life"
    )

    # Most specific wins, which is what every reader already did by checking
    # project first. 453 of 463 name a project; nine name a program or an area
    # directly and are legitimate single actions; one names nothing and stays
    # nothing, because inventing a scope for it would be worse than admitting it
    # has none.
    op.execute("""
        UPDATE wild_life.tasks
           SET scope_type = CASE
                   WHEN project_id IS NOT NULL THEN 'project'
                   WHEN program_id IS NOT NULL THEN 'program'
                   WHEN area_id    IS NOT NULL THEN 'area'
               END,
               scope_id = coalesce(project_id, program_id, area_id)
    """)

    op.create_index(
        "ix_tasks_scope", "tasks", ["scope_type", "scope_id"], schema="wild_life"
    )
    for col in ("project_id", "program_id", "area_id"):
        op.drop_column("tasks", col, schema="wild_life")


def downgrade() -> None:
    for col in ("area_id", "program_id", "project_id"):
        op.add_column(
            "tasks", sa.Column(col, sa.UUID(), nullable=True), schema="wild_life"
        )
    op.execute("""
        UPDATE wild_life.tasks
           SET project_id = CASE WHEN scope_type='project' THEN scope_id END,
               program_id = CASE WHEN scope_type='program' THEN scope_id END,
               area_id    = CASE WHEN scope_type='area'    THEN scope_id END
    """)
    op.drop_index("ix_tasks_scope", "tasks", schema="wild_life")
    op.drop_column("tasks", "scope_id", schema="wild_life")
    op.drop_column("tasks", "scope_type", schema="wild_life")
