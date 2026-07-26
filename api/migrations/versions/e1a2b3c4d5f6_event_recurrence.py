"""event recurrence + external_ref index

Adds RRULE recurrence fields to events and indexes external_ref so external
imports/syncs can dedup idempotently.

Revision ID: e1a2b3c4d5f6
Revises: d4e5f6a7b8c9
Create Date: 2026-07-16 16:00:00.000000
"""

from collections.abc import Sequence

from alembic import op
import sqlalchemy as sa


revision: str = "e1a2b3c4d5f6"
down_revision: str | None = "d4e5f6a7b8c9"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.add_column(
        "events",
        sa.Column("recurrence", sa.Text(), nullable=True),
        schema="wild_life",
    )
    op.add_column(
        "events",
        sa.Column(
            "recurrence_exdates",
            sa.ARRAY(sa.Text()),
            server_default="{}",
            nullable=True,
        ),
        schema="wild_life",
    )
    op.create_index(
        "ix_wild_life_events_external_ref",
        "events",
        ["external_ref"],
        unique=False,
        schema="wild_life",
    )


def downgrade() -> None:
    op.drop_index(
        "ix_wild_life_events_external_ref",
        table_name="events",
        schema="wild_life",
    )
    op.drop_column("events", "recurrence_exdates", schema="wild_life")
    op.drop_column("events", "recurrence", schema="wild_life")
