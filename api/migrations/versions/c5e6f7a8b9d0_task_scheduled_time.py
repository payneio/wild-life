"""task scheduled_time (for calendar time-blocking)

Revision ID: c5e6f7a8b9d0
Revises: b4d5e6f7a8c9
Create Date: 2026-07-17 09:00:00.000000
"""

from collections.abc import Sequence

from alembic import op
import sqlalchemy as sa


revision: str = 'c5e6f7a8b9d0'
down_revision: str | None = 'b4d5e6f7a8c9'
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.add_column(
        'tasks', sa.Column('scheduled_time', sa.Time(), nullable=True), schema='personal_api'
    )


def downgrade() -> None:
    op.drop_column('tasks', 'scheduled_time', schema='personal_api')
