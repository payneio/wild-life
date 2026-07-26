"""enforce NOT NULL on the array columns that already promise it

`Event.recurrence_exdates`, `Routine.timing` and `Routine.days_of_week` are typed
`Mapped[list[str]]` with a `'{}'` server default — the model has always said "a
list, possibly empty, never null" — but the columns were created nullable, so the
guarantee the code relies on wasn't actually in the database. No row violates it
(they all default to `{}`), so this is a pure tightening.

Revision ID: c8e9f0a1b2d3
Revises: b7d8e9f0a1c2
Create Date: 2026-07-26 10:45:00.000000
"""

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects import postgresql


revision: str = "c8e9f0a1b2d3"
down_revision: str | None = "b7d8e9f0a1c2"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None

COLUMNS = [
    ("events", "recurrence_exdates"),
    ("routines", "timing"),
    ("routines", "days_of_week"),
]


def upgrade() -> None:
    for table, column in COLUMNS:
        # Belt and braces: a null here would fail the ALTER, and the default the
        # column already carries is exactly what it should have been.
        op.execute(
            sa.text(
                f"UPDATE wild_life.{table} SET {column} = '{{}}' WHERE {column} IS NULL"
            )
        )
        op.alter_column(
            table,
            column,
            existing_type=postgresql.ARRAY(sa.Text()),
            nullable=False,
            existing_server_default=sa.text("'{}'::text[]"),
            schema="wild_life",
        )


def downgrade() -> None:
    for table, column in COLUMNS:
        op.alter_column(
            table,
            column,
            existing_type=postgresql.ARRAY(sa.Text()),
            nullable=True,
            existing_server_default=sa.text("'{}'::text[]"),
            schema="wild_life",
        )
