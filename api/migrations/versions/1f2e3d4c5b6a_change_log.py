"""change log (history tracking)

Revision ID: 1f2e3d4c5b6a
Revises: 0aca9263467f
Create Date: 2026-07-15 09:00:00.000000
"""

from collections.abc import Sequence

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

revision: str = "1f2e3d4c5b6a"
down_revision: str | None = "0aca9263467f"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.create_table(
        "change_log",
        sa.Column("entity_type", sa.Text(), nullable=False),
        sa.Column("entity_id", sa.UUID(), nullable=True),
        sa.Column("entity_label", sa.Text(), nullable=True),
        sa.Column("action", sa.Text(), nullable=False),
        sa.Column(
            "changes",
            postgresql.JSONB(),
            server_default="{}",
            nullable=False,
        ),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            server_default=sa.text("now()"),
            nullable=False,
        ),
        sa.Column(
            "id", sa.UUID(), server_default=sa.text("gen_random_uuid()"), nullable=False
        ),
        sa.PrimaryKeyConstraint("id"),
        schema="personal_api",
    )
    op.create_index(
        op.f("ix_personal_api_change_log_entity_type"),
        "change_log",
        ["entity_type"],
        unique=False,
        schema="personal_api",
    )
    op.create_index(
        op.f("ix_personal_api_change_log_entity_id"),
        "change_log",
        ["entity_id"],
        unique=False,
        schema="personal_api",
    )
    op.create_index(
        op.f("ix_personal_api_change_log_created_at"),
        "change_log",
        ["created_at"],
        unique=False,
        schema="personal_api",
    )


def downgrade() -> None:
    op.drop_index(
        op.f("ix_personal_api_change_log_created_at"),
        table_name="change_log",
        schema="personal_api",
    )
    op.drop_index(
        op.f("ix_personal_api_change_log_entity_id"),
        table_name="change_log",
        schema="personal_api",
    )
    op.drop_index(
        op.f("ix_personal_api_change_log_entity_type"),
        table_name="change_log",
        schema="personal_api",
    )
    op.drop_table("change_log", schema="personal_api")
