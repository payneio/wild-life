"""add task claim fields

Revision ID: 17c55ff740f0
Revises: d2f4a6c8e0b1
Create Date: 2026-07-19 09:43:23.661276
"""

from collections.abc import Sequence

from alembic import op
import sqlalchemy as sa

revision: str = "17c55ff740f0"
down_revision: str | None = "d2f4a6c8e0b1"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None

_FK = "fk_tasks_claimed_by_id_people"


def upgrade() -> None:
    op.add_column(
        "tasks",
        sa.Column("claimed_by_id", sa.UUID(), nullable=True),
        schema="wild_life",
    )
    op.add_column(
        "tasks",
        sa.Column("claimed_at", sa.DateTime(timezone=True), nullable=True),
        schema="wild_life",
    )
    op.create_index(
        op.f("ix_wild_life_tasks_claimed_by_id"),
        "tasks",
        ["claimed_by_id"],
        unique=False,
        schema="wild_life",
    )
    op.create_foreign_key(
        _FK,
        "tasks",
        "people",
        ["claimed_by_id"],
        ["id"],
        source_schema="wild_life",
        referent_schema="wild_life",
        ondelete="SET NULL",
    )


def downgrade() -> None:
    op.drop_constraint(_FK, "tasks", schema="wild_life", type_="foreignkey")
    op.drop_index(
        op.f("ix_wild_life_tasks_claimed_by_id"),
        table_name="tasks",
        schema="wild_life",
    )
    op.drop_column("tasks", "claimed_at", schema="wild_life")
    op.drop_column("tasks", "claimed_by_id", schema="wild_life")
