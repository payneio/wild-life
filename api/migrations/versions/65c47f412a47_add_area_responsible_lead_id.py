"""add area responsible_lead_id

Revision ID: 65c47f412a47
Revises: 87d25560be8f
Create Date: 2026-07-18 15:58:03.371867
"""

from collections.abc import Sequence

from alembic import op
import sqlalchemy as sa

revision: str = "65c47f412a47"
down_revision: str | None = "87d25560be8f"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None

_FK = "fk_areas_responsible_lead_id_people"


def upgrade() -> None:
    op.add_column(
        "areas",
        sa.Column("responsible_lead_id", sa.UUID(), nullable=True),
        schema="wild_life",
    )
    op.create_index(
        op.f("ix_wild_life_areas_responsible_lead_id"),
        "areas",
        ["responsible_lead_id"],
        unique=False,
        schema="wild_life",
    )
    op.create_foreign_key(
        _FK,
        "areas",
        "people",
        ["responsible_lead_id"],
        ["id"],
        source_schema="wild_life",
        referent_schema="wild_life",
        ondelete="SET NULL",
    )


def downgrade() -> None:
    op.drop_constraint(_FK, "areas", schema="wild_life", type_="foreignkey")
    op.drop_index(
        op.f("ix_wild_life_areas_responsible_lead_id"),
        table_name="areas",
        schema="wild_life",
    )
    op.drop_column("areas", "responsible_lead_id", schema="wild_life")
