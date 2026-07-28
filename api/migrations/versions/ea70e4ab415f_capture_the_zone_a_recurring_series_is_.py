"""capture the zone a recurring series is expressed in

A weekly 9am meeting is not a weekly instant. Stored as UTC it drifts an hour the
moment daylight saving moves under it, and every occurrence after the boundary is
wrong by an hour — which is what the app does today, because ``TZID`` is resolved
to an offset at import and then thrown away.

Two columns, for two different reasons:

- ``routines.timezone`` — **part of the cadence, and permanent.** "Every Tuesday
  at 09:00" is meaningless without saying where, so the zone belongs to our own
  rule expression rather than to the wire. The evaluator builds each occurrence
  as a local wall time in this zone, which is what keeps 9am at 9am across a
  boundary.
- ``events.timezone`` — **transitional.** The importers still write ``events``
  until the calendar's write path moves, so this is where a captured TZID lands
  on the way to the rule. It dies with the table.

Null means what the app has always done: the stored instant is authoritative and
expansion happens in UTC. The 1,279 already-synced events stay null, because the
zone was discarded before it ever reached the database — re-running
``scripts/import_ics.py`` over the source calendar is what recovers them.

Revision ID: ea70e4ab415f
Revises: edfb691fc125
Create Date: 2026-07-28 14:28:51.553128
"""

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op

revision: str = "ea70e4ab415f"
down_revision: str | None = "edfb691fc125"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None

SCHEMA = "wild_life"


def upgrade() -> None:
    op.add_column("routines", sa.Column("timezone", sa.Text()), schema=SCHEMA)
    op.add_column("events", sa.Column("timezone", sa.Text()), schema=SCHEMA)


def downgrade() -> None:
    op.drop_column("events", "timezone", schema=SCHEMA)
    op.drop_column("routines", "timezone", schema=SCHEMA)
