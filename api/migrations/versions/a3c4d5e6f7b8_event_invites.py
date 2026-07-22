"""event invitation / iMIP RSVP fields

Revision ID: a3c4d5e6f7b8
Revises: f2b3c4d5e6a7
Create Date: 2026-07-16 17:00:00.000000
"""

from collections.abc import Sequence

from alembic import op
import sqlalchemy as sa


revision: str = 'a3c4d5e6f7b8'
down_revision: str | None = 'f2b3c4d5e6a7'
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    for col in ('organizer', 'rsvp_status', 'rsvp_sent_status'):
        op.add_column(
            'events', sa.Column(col, sa.Text(), nullable=True), schema='wild_life'
        )
    op.add_column(
        'events', sa.Column('sequence', sa.Integer(), nullable=True), schema='wild_life'
    )


def downgrade() -> None:
    for col in ('sequence', 'rsvp_sent_status', 'rsvp_status', 'organizer'):
        op.drop_column('events', col, schema='wild_life')
