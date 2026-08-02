"""whiteboard: write token + displaced revisions

Autogenerate also picked up unrelated drift elsewhere in the schema (index
naming, NOT NULLs on `intention_moments` / `outcome_evaluations` /
`task_objectives`, a dropped `ix_tasks_scope`). None of it belongs to this
change, so none of it is here.

Revision ID: 6749fd6aae93
Revises: b3a4c5d6e7f8
Create Date: 2026-08-01 16:37:09.937456
"""

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op

revision: str = "6749fd6aae93"
down_revision: str | None = "b3a4c5d6e7f8"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    # Existing content starts at version 0, which is what a client that has
    # never read reports — so the first write after this migration must come
    # from a reader. That is the intent, not an accident of the default.
    op.add_column(
        "whiteboard",
        sa.Column("version", sa.Integer(), server_default="0", nullable=False),
        schema="wild_life",
    )
    op.create_table(
        "whiteboard_revisions",
        sa.Column(
            "id",
            sa.UUID(),
            server_default=sa.text("gen_random_uuid()"),
            nullable=False,
        ),
        sa.Column("content", sa.Text(), nullable=False),
        sa.Column("version", sa.Integer(), nullable=False),
        sa.Column(
            "replaced_at",
            sa.DateTime(timezone=True),
            server_default=sa.text("now()"),
            nullable=False,
        ),
        sa.PrimaryKeyConstraint("id"),
        schema="wild_life",
    )
    # Every read of this table is "most recently displaced first", and the
    # prune is the same order.
    op.create_index(
        "ix_whiteboard_revisions_replaced_at",
        "whiteboard_revisions",
        [sa.text("replaced_at DESC")],
        schema="wild_life",
    )


def downgrade() -> None:
    op.drop_index(
        "ix_whiteboard_revisions_replaced_at",
        table_name="whiteboard_revisions",
        schema="wild_life",
    )
    op.drop_table("whiteboard_revisions", schema="wild_life")
    op.drop_column("whiteboard", "version", schema="wild_life")
