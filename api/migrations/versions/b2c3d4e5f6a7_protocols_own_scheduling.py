"""protocols own scheduling; medication = identity; derive lifecycle

- routines: `protocol_id` becomes NOT NULL (every routine is a protocol step); drop
  `as_needed` + `trigger` (PRN retired — ad-hoc dosing is "log a dose").
- protocols: drop the `status` enum, add `paused` bool (planned/active/completed
  derive from the window; `paused` is the one non-derivable bit). Backfill
  `paused = (status = 'paused')`.
- medications: drop `status`, `start_date`, `end_date` — identity only; active state
  derives from live protocol steps.

Data is pre-cleaned (every routine already has a protocol), so NOT NULL is safe.

Revision ID: b2c3d4e5f6a7
Revises: f1e2d3c4b5a6
Create Date: 2026-07-23
"""

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op

revision: str = "b2c3d4e5f6a7"
down_revision: str | None = "f1e2d3c4b5a6"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None

SCHEMA = "wild_life"


def upgrade() -> None:
    # routines: protocol required; PRN retired.
    op.alter_column(
        "routines", "protocol_id", nullable=False, schema=SCHEMA
    )
    op.drop_column("routines", "as_needed", schema=SCHEMA)
    op.drop_column("routines", "trigger", schema=SCHEMA)

    # protocols: status enum -> derived + a lone `paused` bit.
    op.add_column(
        "protocols",
        sa.Column("paused", sa.Boolean(), server_default=sa.text("false"), nullable=False),
        schema=SCHEMA,
    )
    op.execute(f"UPDATE {SCHEMA}.protocols SET paused = true WHERE status = 'paused'")
    op.drop_column("protocols", "status", schema=SCHEMA)

    # medications: identity only.
    op.drop_column("medications", "status", schema=SCHEMA)
    op.drop_column("medications", "start_date", schema=SCHEMA)
    op.drop_column("medications", "end_date", schema=SCHEMA)


def downgrade() -> None:
    op.add_column(
        "medications",
        sa.Column("end_date", sa.Date(), nullable=True),
        schema=SCHEMA,
    )
    op.add_column(
        "medications",
        sa.Column("start_date", sa.Date(), nullable=True),
        schema=SCHEMA,
    )
    op.add_column(
        "medications",
        sa.Column(
            "status", sa.Text(), server_default="active", nullable=False
        ),
        schema=SCHEMA,
    )

    op.add_column(
        "protocols",
        sa.Column(
            "status", sa.Text(), server_default="planned", nullable=False
        ),
        schema=SCHEMA,
    )
    op.execute(
        f"UPDATE {SCHEMA}.protocols SET status = "
        f"CASE WHEN paused THEN 'paused' ELSE 'active' END"
    )
    op.drop_column("protocols", "paused", schema=SCHEMA)

    op.add_column(
        "routines",
        sa.Column("trigger", sa.Text(), nullable=True),
        schema=SCHEMA,
    )
    op.add_column(
        "routines",
        sa.Column(
            "as_needed", sa.Boolean(), server_default=sa.text("false"), nullable=False
        ),
        schema=SCHEMA,
    )
    op.alter_column("routines", "protocol_id", nullable=True, schema=SCHEMA)
