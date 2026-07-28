"""whiteboard becomes a genre

The Journal used to be defined by negation — notes carrying neither the
`work:microsoft` nor the `whiteboard` tag — which made a deliberate journal entry
indistinguishable from an unfiled scrap and put 254 reflective entries in the
triage inbox. Genre now lives where it belongs, in `note_type`.

Two data moves:

1. Whiteboard scraps carried a `whiteboard` tag and were scoped by it. They
   become `note_type='scratch'`, a self-homing genre alongside `journal`, and
   the tag is dropped so nothing is scoped by tag any more.
2. Journal entries with no `entry_date` were unreachable: both the year filter
   and the calendar count require it. Backfill from `created_at` so "Journal =
   every journal entry, by date" is a promise the data can keep.

The `work:microsoft` tag is deliberately left in place — it stops being a *scope*
and stays a *tag*, which is a lens you can filter by.

Revision ID: d7e8f9a0b1c2
Revises: c6d7e8f9a0b1
Create Date: 2026-07-27
"""

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op

revision: str = "d7e8f9a0b1c2"
down_revision: str | None = "c6d7e8f9a0b1"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.execute(
        sa.text(
            """
            UPDATE wild_life.notes
               SET note_type = 'scratch',
                   tags = array_remove(tags, 'whiteboard')
             WHERE 'whiteboard' = ANY(tags)
            """
        )
    )
    op.execute(
        sa.text(
            """
            UPDATE wild_life.notes
               SET entry_date = (created_at AT TIME ZONE 'UTC')::date
             WHERE note_type IN ('journal', 'scratch')
               AND entry_date IS NULL
            """
        )
    )


def downgrade() -> None:
    # Only the genre move is reversible; the backfilled dates are indistinguishable
    # from hand-entered ones once written, so they stay.
    op.execute(
        sa.text(
            """
            UPDATE wild_life.notes
               SET note_type = 'note',
                   tags = array_append(tags, 'whiteboard')
             WHERE note_type = 'scratch'
            """
        )
    )
