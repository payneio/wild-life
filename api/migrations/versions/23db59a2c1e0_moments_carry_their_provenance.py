"""moments carry their provenance

`source_ref` names the row a backfilled moment came from — "note:<uuid>",
"task:<uuid>:completion" — and is unique, which is what makes the backfill
idempotent: re-running it conflicts on this column and updates in place rather
than duplicating a 29-year archive.

It also answers "where did this come from?" while both systems coexist, which
matters more than it sounds during a migration that will run several times before
anyone trusts it. Null for anything authored after the inversion, and droppable
in Phase 5 once nothing has two homes.

Revision ID: 23db59a2c1e0
Revises: 12ca48f1b0d9
Create Date: 2026-07-28
"""

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op

revision: str = "23db59a2c1e0"
down_revision: str | None = "12ca48f1b0d9"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.add_column(
        "moments",
        sa.Column("source_ref", sa.Text(), nullable=True),
        schema="wild_life",
    )
    op.create_index(
        "uq_moments_source_ref",
        "moments",
        ["source_ref"],
        unique=True,
        schema="wild_life",
    )


def downgrade() -> None:
    op.drop_index("uq_moments_source_ref", table_name="moments", schema="wild_life")
    op.drop_column("moments", "source_ref", schema="wild_life")
