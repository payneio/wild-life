"""Give a project a cadence, so attention can fail at every altitude.

`docs/model.md` A1: a scope unexamined past its cadence is a failure of
attention, at *every* altitude. Areas and programs could declare one; projects
could not, and were judged instead by `last_activity_date` — which measures
whether work happened inside them, not whether anyone looked. A project can hum
along untouched by attention for months while its tasks tick over, and that was
precisely the case the old signal could not report.

Nullable, and expected to stay null on almost every row: A10 has cadence inherit
from the nearest ancestor that declares one, so this column exists for the
project that needs a *different* rhythm from its program, not for the 36 that
don't.

Revision ID: a1b2c3d4e5f6
Revises: f8a9b0c1d2e3
"""

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op

revision: str = "a1b2c3d4e5f6"
down_revision: str | None = "f8a9b0c1d2e3"
branch_labels: Sequence[str] | None = None
depends_on: Sequence[str] | None = None


def upgrade() -> None:
    op.add_column(
        "projects",
        sa.Column("review_frequency", sa.Text(), nullable=True),
        schema="wild_life",
    )


def downgrade() -> None:
    op.drop_column("projects", "review_frequency", schema="wild_life")
