"""drop goals, goal_projects, and the prose criteria columns now held as outcomes

The second half of `d5e6f7a8b9c0`, deliberately separate: that revision writes the
outcomes and leaves every source in place, so the two can be read against each
other before anything is removed. This one removes them, and refuses to run if
what it is about to drop was never carried across.

Revision ID: e6f7a8b9c0d1
Revises: d5e6f7a8b9c0
Create Date: 2026-07-26
"""

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op

revision: str = "e6f7a8b9c0d1"
down_revision: str | None = "d5e6f7a8b9c0"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    conn = op.get_bind()

    # A drop that silently loses rows is the failure this whole change is about.
    # Every goal must have become an outcome; the two known-empty tables are
    # named rather than assumed.
    goals = conn.execute(sa.text("SELECT count(*) FROM wild_life.goals")).scalar()
    carried = conn.execute(
        sa.text(
            "SELECT count(*) FROM wild_life.outcomes WHERE metric_id IS NOT NULL "
            "OR kind IN ('target', 'standard')"
        )
    ).scalar()
    if goals and not carried:
        raise RuntimeError(
            f"{goals} goals but no outcomes carried across — run d5e6f7a8b9c0 first"
        )
    for table in ("goal_projects",):
        rows = conn.execute(sa.text(f"SELECT count(*) FROM wild_life.{table}")).scalar()
        if rows:
            raise RuntimeError(
                f"{table} has {rows} rows; the outcomes model replaces it with "
                "entity_links(relation='advances') and this migration would lose them"
            )

    op.drop_table("goal_projects", schema="wild_life")
    op.drop_table("goals", schema="wild_life")
    op.drop_column("metrics", "target_value", schema="wild_life")
    op.drop_column("programs", "success_criteria", schema="wild_life")
    op.drop_column("projects", "completion_criteria", schema="wild_life")
    op.drop_column("areas", "desired_standard", schema="wild_life")


def downgrade() -> None:
    # Structure only — the prose itself lives on as outcome statements.
    op.add_column(
        "areas", sa.Column("desired_standard", sa.Text(), nullable=True), schema="wild_life"
    )
    op.add_column(
        "projects",
        sa.Column("completion_criteria", sa.Text(), nullable=True),
        schema="wild_life",
    )
    op.add_column(
        "programs",
        sa.Column("success_criteria", sa.Text(), nullable=True),
        schema="wild_life",
    )
    op.add_column(
        "metrics", sa.Column("target_value", sa.Float(), nullable=True), schema="wild_life"
    )
    op.create_table(
        "goals",
        sa.Column(
            "id", sa.UUID(), server_default=sa.text("gen_random_uuid()"), nullable=False
        ),
        sa.Column("name", sa.Text(), nullable=False),
        sa.Column("description", sa.Text(), nullable=True),
        sa.Column("area_id", sa.UUID(), nullable=True),
        sa.Column("program_id", sa.UUID(), nullable=True),
        sa.Column("metric_id", sa.UUID(), nullable=True),
        sa.Column("condition_id", sa.UUID(), nullable=True),
        sa.Column("target_state", sa.Text(), nullable=True),
        sa.Column("target_value", sa.Float(), nullable=True),
        sa.Column("baseline", sa.Float(), nullable=True),
        sa.Column("target_date", sa.Date(), nullable=True),
        sa.Column("status", sa.Text(), server_default="active", nullable=False),
        sa.Column("progress", sa.Float(), nullable=True),
        sa.Column("measurement_method", sa.Text(), nullable=True),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            server_default=sa.text("now()"),
            nullable=False,
        ),
        sa.Column(
            "updated_at",
            sa.DateTime(timezone=True),
            server_default=sa.text("now()"),
            nullable=False,
        ),
        sa.PrimaryKeyConstraint("id"),
        schema="wild_life",
    )
    op.create_table(
        "goal_projects",
        sa.Column("goal_id", sa.UUID(), nullable=False),
        sa.Column("project_id", sa.UUID(), nullable=False),
        sa.PrimaryKeyConstraint("goal_id", "project_id"),
        schema="wild_life",
    )
