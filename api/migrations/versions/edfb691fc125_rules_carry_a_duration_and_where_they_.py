"""rules carry a duration and where they came from

Two columns an occasion rule needs and a dose rule never did:

- ``expected_minutes`` — how long a generated occurrence runs. Decision 12 puts
  expected duration on the intention, and a generated occurrence *is* one, so the
  rule carries the default to stamp onto it. A dose takes no time; a meeting
  does, and "9am" without "for an hour" cannot be drawn on a calendar.
- ``source_ref`` — the row a backfilled rule was built from
  (``event:<uuid>:rule``). Unique, which is what makes the occasion-rule backfill
  idempotent and re-runnable, exactly as the same column does for moments. Null
  for anything authored here.

Revision ID: edfb691fc125
Revises: 1ec77e09ce82
Create Date: 2026-07-28 14:19:03.890160
"""

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op

revision: str = "edfb691fc125"
down_revision: str | None = "1ec77e09ce82"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None

SCHEMA = "wild_life"


def upgrade() -> None:
    op.add_column(
        "routines", sa.Column("expected_minutes", sa.Integer()), schema=SCHEMA
    )
    op.add_column("routines", sa.Column("source_ref", sa.Text()), schema=SCHEMA)
    op.create_index(
        "uq_routines_source_ref", "routines", ["source_ref"], unique=True, schema=SCHEMA
    )


def downgrade() -> None:
    op.drop_index("uq_routines_source_ref", "routines", schema=SCHEMA)
    op.drop_column("routines", "source_ref", schema=SCHEMA)
    op.drop_column("routines", "expected_minutes", schema=SCHEMA)
