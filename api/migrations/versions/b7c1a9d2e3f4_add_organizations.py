"""add organizations + person.organization_id

Revision ID: b7c1a9d2e3f4
Revises: 633982151ca4
Create Date: 2026-07-15
"""

from collections.abc import Sequence

from alembic import op
import sqlalchemy as sa

revision: str = "b7c1a9d2e3f4"
down_revision: str | None = "633982151ca4"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.create_table(
        "organizations",
        sa.Column("name", sa.Text(), nullable=False),
        sa.Column("org_type", sa.Text(), nullable=True),
        sa.Column("industry", sa.Text(), nullable=True),
        sa.Column("website", sa.Text(), nullable=True),
        sa.Column("email", sa.Text(), nullable=True),
        sa.Column("phone", sa.Text(), nullable=True),
        sa.Column("address", sa.Text(), nullable=True),
        sa.Column("description", sa.Text(), nullable=True),
        sa.Column("status", sa.Text(), server_default="active", nullable=False),
        sa.Column("notes", sa.Text(), nullable=True),
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
        schema="wild_life",
    )
    op.add_column(
        "people",
        sa.Column("organization_id", sa.UUID(), nullable=True),
        schema="wild_life",
    )
    op.create_index(
        op.f("ix_wild_life_people_organization_id"),
        "people",
        ["organization_id"],
        unique=False,
        schema="wild_life",
    )
    op.create_foreign_key(
        op.f("fk_wild_life_people_organization_id_organizations"),
        "people",
        "organizations",
        ["organization_id"],
        ["id"],
        source_schema="wild_life",
        referent_schema="wild_life",
        ondelete="SET NULL",
    )


def downgrade() -> None:
    op.drop_constraint(
        op.f("fk_wild_life_people_organization_id_organizations"),
        "people",
        schema="wild_life",
        type_="foreignkey",
    )
    op.drop_index(
        op.f("ix_wild_life_people_organization_id"),
        table_name="people",
        schema="wild_life",
    )
    op.drop_column("people", "organization_id", schema="wild_life")
    op.drop_table("organizations", schema="wild_life")
