"""event recurrence override linkage

Adds recurrence_parent_id (self-FK to the master) + recurrence_id (the original
occurrence a row overrides), so modified single occurrences of a recurring series
are proper linked rows rather than floating events.

Revision ID: b4d5e6f7a8c9
Revises: a3c4d5e6f7b8
Create Date: 2026-07-16 18:00:00.000000
"""

from collections.abc import Sequence

from alembic import op
import sqlalchemy as sa


revision: str = 'b4d5e6f7a8c9'
down_revision: str | None = 'a3c4d5e6f7b8'
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.add_column(
        'events',
        sa.Column('recurrence_parent_id', sa.UUID(), nullable=True),
        schema='personal_api',
    )
    op.add_column(
        'events',
        sa.Column('recurrence_id', sa.DateTime(timezone=True), nullable=True),
        schema='personal_api',
    )
    op.create_foreign_key(
        'fk_events_recurrence_parent',
        'events',
        'events',
        ['recurrence_parent_id'],
        ['id'],
        source_schema='personal_api',
        referent_schema='personal_api',
        ondelete='CASCADE',
    )
    op.create_index(
        'ix_personal_api_events_recurrence_parent_id',
        'events',
        ['recurrence_parent_id'],
        unique=False,
        schema='personal_api',
    )


def downgrade() -> None:
    op.drop_index(
        'ix_personal_api_events_recurrence_parent_id',
        table_name='events',
        schema='personal_api',
    )
    op.drop_constraint(
        'fk_events_recurrence_parent', 'events', schema='personal_api', type_='foreignkey'
    )
    op.drop_column('events', 'recurrence_id', schema='personal_api')
    op.drop_column('events', 'recurrence_parent_id', schema='personal_api')
