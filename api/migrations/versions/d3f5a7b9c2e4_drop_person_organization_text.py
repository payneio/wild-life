"""drop free-text person.organization (superseded by affiliations)

Revision ID: d3f5a7b9c2e4
Revises: c8d2e4f6a1b3
Create Date: 2026-07-15
"""

from collections.abc import Sequence

from alembic import op
import sqlalchemy as sa

revision: str = "d3f5a7b9c2e4"
down_revision: str | None = "c8d2e4f6a1b3"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.drop_column("people", "organization", schema="personal_api")


def downgrade() -> None:
    op.add_column(
        "people",
        sa.Column("organization", sa.Text(), nullable=True),
        schema="personal_api",
    )
