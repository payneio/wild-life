"""drop the dormant health_events table

Health events were folded into type-faceted Events (e4f5a6b7c8d9); the source
table was kept as a backup and is now removed. Downgrade recreates the (empty)
table structure — the copied data lives on as events + notes and is not restored.

Revision ID: a6b7c8d9e0f1
Revises: f5a6b7c8d9e0
Create Date: 2026-07-22
"""

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op

revision: str = "a6b7c8d9e0f1"
down_revision: str | None = "f5a6b7c8d9e0"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.drop_table("health_events", schema="wild_life")


def downgrade() -> None:
    op.create_table(
        "health_events",
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
        sa.Column("occurred_on", sa.Date(), nullable=False),
        sa.Column(
            "event_type", sa.Text(), server_default="appointment", nullable=False
        ),
        sa.Column("title", sa.Text(), nullable=False),
        sa.Column("provider_id", sa.UUID(), nullable=True),
        sa.Column("organization_id", sa.UUID(), nullable=True),
        sa.Column("condition_id", sa.UUID(), nullable=True),
        sa.Column("summary", sa.Text(), nullable=True),
        sa.Column("findings", sa.Text(), nullable=True),
        sa.Column("recommendations", sa.Text(), nullable=True),
        sa.Column("follow_up", sa.Text(), nullable=True),
        sa.Column("follow_up_date", sa.Date(), nullable=True),
        sa.Column("location", sa.Text(), nullable=True),
        sa.Column("external_ref", sa.Text(), nullable=True),
        sa.Column("notes", sa.Text(), nullable=True),
        sa.PrimaryKeyConstraint("id"),
        schema="wild_life",
    )
    op.create_index(
        "ix_health_events_occurred_on",
        "health_events",
        ["occurred_on"],
        schema="wild_life",
    )
