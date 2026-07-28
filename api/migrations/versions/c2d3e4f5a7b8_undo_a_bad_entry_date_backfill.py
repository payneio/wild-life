"""undo a bad entry_date backfill: created_at is not when imported writing happened

`d7e8f9a0b1c2` backfilled `entry_date = created_at::date` for journal entries
that had none, so they would stop being invisible in a year-scoped stream. The
reasoning was right and the fallback was wrong: for anything *imported*,
`created_at` is when the import ran, not when the entry was written. Every
journal entry in this database arrived in one bulk load on 2026-07-15, so the
backfill stamped that day onto writing from years earlier — and an entry titled
"Aug 6, 2023" sorted to the top of the journal claiming to be the newest thing
in it.

Two rows were affected, and both have a recoverable real date:

- "Aug 6, 2023" — the title *is* the date. 69 of the 70 date-titled notes in this
  database already carry an `entry_date` matching their title exactly; this was
  the only one that didn't.
- "Health" — a section of the 2025 year-in-review ("Arc of the Year",
  "January-March … November-December", "By year's end"), sharing its subject
  matter with the note titled "Summary of 2025" dated 2025-12-31.

The general fix already landed separately: `routers/notes.py` computes
`COALESCE(entry_date, created_at::date)` at query time for filtering and
ordering, so an undated note is reachable without the stored date having to
claim something untrue. A backfill was never needed.

Revision ID: c2d3e4f5a7b8
Revises: b1c2d3e4f5a7
Create Date: 2026-07-27
"""

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op

revision: str = "c2d3e4f5a7b8"
down_revision: str | None = "b1c2d3e4f5a7"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None

# (note id, the date the writing actually carries)
CORRECTIONS: list[tuple[str, str]] = [
    ("a974fe51-e983-4ba5-9d85-99676bbb1d01", "2023-08-06"),  # titled "Aug 6, 2023"
    ("bceb5853-05ae-40ed-bd46-a8c116dcaeb9", "2025-12-31"),  # part of the 2025 summary
]

# What the bad backfill wrote, and what `downgrade` therefore restores.
_BACKFILLED = "2026-07-15"


def upgrade() -> None:
    for note_id, real_date in CORRECTIONS:
        op.execute(
            sa.text(
                "UPDATE wild_life.notes SET entry_date = CAST(:d AS date) "
                "WHERE id = CAST(:i AS uuid)"
            ).bindparams(d=real_date, i=note_id)
        )


def downgrade() -> None:
    for note_id, _ in CORRECTIONS:
        op.execute(
            sa.text(
                "UPDATE wild_life.notes SET entry_date = CAST(:d AS date) "
                "WHERE id = CAST(:i AS uuid)"
            ).bindparams(d=_BACKFILLED, i=note_id)
        )
