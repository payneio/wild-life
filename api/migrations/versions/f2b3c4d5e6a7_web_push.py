"""web push subscriptions + sent reminders ledger

Revision ID: f2b3c4d5e6a7
Revises: e1a2b3c4d5f6
Create Date: 2026-07-16 16:30:00.000000
"""

from collections.abc import Sequence

from alembic import op
import sqlalchemy as sa


revision: str = 'f2b3c4d5e6a7'
down_revision: str | None = 'e1a2b3c4d5f6'
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.create_table(
        'push_subscriptions',
        sa.Column('endpoint', sa.Text(), nullable=False),
        sa.Column('p256dh', sa.Text(), nullable=False),
        sa.Column('auth', sa.Text(), nullable=False),
        sa.Column('label', sa.Text(), nullable=True),
        sa.Column('id', sa.UUID(), server_default=sa.text('gen_random_uuid()'), nullable=False),
        sa.Column('created_at', sa.DateTime(timezone=True), server_default=sa.text('now()'), nullable=False),
        sa.Column('updated_at', sa.DateTime(timezone=True), server_default=sa.text('now()'), nullable=False),
        sa.PrimaryKeyConstraint('id'),
        sa.UniqueConstraint('endpoint', name='uq_push_endpoint'),
        schema='personal_api',
    )
    op.create_table(
        'sent_reminders',
        sa.Column('event_id', sa.UUID(), nullable=False),
        sa.Column('occurrence_start', sa.DateTime(timezone=True), nullable=False),
        sa.Column('lead_minutes', sa.Integer(), nullable=False),
        sa.Column('id', sa.UUID(), server_default=sa.text('gen_random_uuid()'), nullable=False),
        sa.Column('created_at', sa.DateTime(timezone=True), server_default=sa.text('now()'), nullable=False),
        sa.Column('updated_at', sa.DateTime(timezone=True), server_default=sa.text('now()'), nullable=False),
        sa.ForeignKeyConstraint(['event_id'], ['personal_api.events.id'], ondelete='CASCADE'),
        sa.PrimaryKeyConstraint('id'),
        sa.UniqueConstraint('event_id', 'occurrence_start', 'lead_minutes', name='uq_sent_reminder'),
        schema='personal_api',
    )
    op.create_index(
        'ix_personal_api_sent_reminders_event_id',
        'sent_reminders',
        ['event_id'],
        unique=False,
        schema='personal_api',
    )


def downgrade() -> None:
    op.drop_index('ix_personal_api_sent_reminders_event_id', table_name='sent_reminders', schema='personal_api')
    op.drop_table('sent_reminders', schema='personal_api')
    op.drop_table('push_subscriptions', schema='personal_api')
