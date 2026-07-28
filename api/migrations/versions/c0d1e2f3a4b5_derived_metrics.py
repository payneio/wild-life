"""a metric can compute itself

Hand-logged measurement doesn't happen here — 19 typed readings against 404
completed tasks over the same period, and every metric in one area. A metric can
now name a derivation instead: a computation over rows already present, evaluated
on read, with no entry UI and nothing to remember.

Revision ID: c0d1e2f3a4b5
Revises: b9c0d1e2f3a4
Create Date: 2026-07-26
"""

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op

revision: str = "c0d1e2f3a4b5"
down_revision: str | None = "b9c0d1e2f3a4"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.add_column(
        "metrics",
        sa.Column("source", sa.Text(), server_default="manual", nullable=False),
        schema="wild_life",
    )
    op.add_column(
        "metrics", sa.Column("derivation", sa.Text(), nullable=True), schema="wild_life"
    )


def downgrade() -> None:
    op.drop_column("metrics", "derivation", schema="wild_life")
    op.drop_column("metrics", "source", schema="wild_life")
