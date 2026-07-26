"""sent nudges ledger (daily digest dedup)

Revision ID: e7a8b9c0d1f2
Revises: d6f7a8b9c0e1
Create Date: 2026-07-17 11:00:00.000000
"""

from collections.abc import Sequence

from alembic import op
import sqlalchemy as sa


revision: str = "e7a8b9c0d1f2"
down_revision: str | None = "d6f7a8b9c0e1"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.create_table(
        "sent_nudges",
        sa.Column("kind", sa.Text(), nullable=False),
        sa.Column("nudge_date", sa.Date(), nullable=False),
        sa.Column(
            "id", sa.UUID(), server_default=sa.text("gen_random_uuid()"), nullable=False
        ),
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
        sa.UniqueConstraint("kind", "nudge_date", name="uq_sent_nudge"),
        schema="wild_life",
    )


def downgrade() -> None:
    op.drop_table("sent_nudges", schema="wild_life")
