"""medication dose log (adherence)

Revision ID: d6f7a8b9c0e1
Revises: c5e6f7a8b9d0
Create Date: 2026-07-17 10:00:00.000000
"""

from collections.abc import Sequence

from alembic import op
import sqlalchemy as sa


revision: str = 'd6f7a8b9c0e1'
down_revision: str | None = 'c5e6f7a8b9d0'
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.create_table(
        'medication_doses',
        sa.Column('medication_id', sa.UUID(), nullable=False),
        sa.Column('dose_date', sa.Date(), nullable=False),
        sa.Column('slot', sa.Text(), nullable=False),
        sa.Column('taken_at', sa.DateTime(timezone=True), nullable=True),
        sa.Column('id', sa.UUID(), server_default=sa.text('gen_random_uuid()'), nullable=False),
        sa.Column('created_at', sa.DateTime(timezone=True), server_default=sa.text('now()'), nullable=False),
        sa.Column('updated_at', sa.DateTime(timezone=True), server_default=sa.text('now()'), nullable=False),
        sa.ForeignKeyConstraint(['medication_id'], ['wild_life.medications.id'], ondelete='CASCADE'),
        sa.PrimaryKeyConstraint('id'),
        sa.UniqueConstraint('medication_id', 'dose_date', 'slot', name='uq_medication_dose'),
        schema='wild_life',
    )
    op.create_index('ix_wild_life_medication_doses_medication_id', 'medication_doses', ['medication_id'], schema='wild_life')
    op.create_index('ix_wild_life_medication_doses_dose_date', 'medication_doses', ['dose_date'], schema='wild_life')


def downgrade() -> None:
    op.drop_table('medication_doses', schema='wild_life')
