"""replace person.organization_id with affiliations join

Revision ID: c8d2e4f6a1b3
Revises: b7c1a9d2e3f4
Create Date: 2026-07-15
"""

from collections.abc import Sequence

from alembic import op
import sqlalchemy as sa

revision: str = "c8d2e4f6a1b3"
down_revision: str | None = "b7c1a9d2e3f4"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    # Drop the single-org FK — a person can belong to many organizations.
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

    op.create_table(
        "affiliations",
        sa.Column("person_id", sa.UUID(), nullable=False),
        sa.Column("organization_id", sa.UUID(), nullable=False),
        sa.Column("role", sa.Text(), nullable=True),
        sa.Column(
            "is_primary", sa.Boolean(), server_default=sa.text("false"), nullable=False
        ),
        sa.Column("start_date", sa.Date(), nullable=True),
        sa.Column("end_date", sa.Date(), nullable=True),
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
        sa.ForeignKeyConstraint(
            ["person_id"],
            ["wild_life.people.id"],
            name=op.f("fk_wild_life_affiliations_person_id_people"),
            ondelete="CASCADE",
        ),
        sa.ForeignKeyConstraint(
            ["organization_id"],
            ["wild_life.organizations.id"],
            name=op.f("fk_wild_life_affiliations_organization_id_organizations"),
            ondelete="CASCADE",
        ),
        sa.PrimaryKeyConstraint("id"),
        schema="wild_life",
    )
    op.create_index(
        op.f("ix_wild_life_affiliations_person_id"),
        "affiliations",
        ["person_id"],
        unique=False,
        schema="wild_life",
    )
    op.create_index(
        op.f("ix_wild_life_affiliations_organization_id"),
        "affiliations",
        ["organization_id"],
        unique=False,
        schema="wild_life",
    )


def downgrade() -> None:
    op.drop_index(
        op.f("ix_wild_life_affiliations_organization_id"),
        table_name="affiliations",
        schema="wild_life",
    )
    op.drop_index(
        op.f("ix_wild_life_affiliations_person_id"),
        table_name="affiliations",
        schema="wild_life",
    )
    op.drop_table("affiliations", schema="wild_life")

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
