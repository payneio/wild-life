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
        schema="personal_api",
    )
    op.add_column(
        "tasks",
        sa.Column("claimed_at", sa.DateTime(timezone=True), nullable=True),
        schema="personal_api",
    )
    op.create_index(
        op.f("ix_personal_api_tasks_claimed_by_id"),
        "tasks",
        ["claimed_by_id"],
        unique=False,
        schema="personal_api",
    )
    op.create_foreign_key(
        _FK,
        "tasks",
        "people",
        ["claimed_by_id"],
        ["id"],
        source_schema="personal_api",
        referent_schema="personal_api",
        ondelete="SET NULL",
    )


def downgrade() -> None:
    op.drop_constraint(_FK, "tasks", schema="personal_api", type_="foreignkey")
    op.drop_index(
        op.f("ix_personal_api_tasks_claimed_by_id"),
        table_name="tasks",
        schema="personal_api",
    )
    op.drop_column("tasks", "claimed_at", schema="personal_api")
    op.drop_column("tasks", "claimed_by_id", schema="personal_api")
