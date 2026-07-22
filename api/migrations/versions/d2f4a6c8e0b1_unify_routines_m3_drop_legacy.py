"""unify routines M3 — drop the legacy dose-line + medication-dose tables

Stage 5 cutover cleanup. Their data was folded into ``routines`` /
``routine_instances`` by M2, and all code now reads the unified tables. A full
snapshot remains in schema ``wild_life_backup`` (the true rollback path).

Revision ID: d2f4a6c8e0b1
Revises: b8e2f04c1d59
Create Date: 2026-07-19
"""

from alembic import op

revision = "d2f4a6c8e0b1"
down_revision = "b8e2f04c1d59"
branch_labels = None
depends_on = None

SCHEMA = "wild_life"


def upgrade() -> None:
    op.drop_table("medication_doses", schema=SCHEMA)
    op.drop_table("protocol_items", schema=SCHEMA)


def downgrade() -> None:
    # Forward-only: the legacy tables' data was folded into routines /
    # routine_instances and the snapshot schema has been dropped. There is no
    # automatic path back.
    raise NotImplementedError(
        "M3 drops legacy dose-line tables irreversibly; no downgrade."
    )
