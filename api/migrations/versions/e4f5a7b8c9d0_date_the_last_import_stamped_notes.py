"""date the last three import-stamped notes from their titles

The tail of the import date-stamping, after `d3e4f5a7b8c9` recovered the 388 with
a machine-readable marker. These three are area-rooted work notes whose titles
carry the date in prose. Two name a month and day without a year; Paul confirmed
all three are 2025, which the work journal's own range (starting 2025-09-24)
already suggested.

Every other note still carrying an import date is correct: they are contextual
notes about people and projects, where the day it was recorded *is* the note's
date. ("Met 2026-02-10" inside a description of someone is a fact in the prose,
not a date for the note.)

Revision ID: e4f5a7b8c9d0
Revises: d3e4f5a7b8c9
Create Date: 2026-07-27
"""

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op

revision: str = "e4f5a7b8c9d0"
down_revision: str | None = "d3e4f5a7b8c9"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None

# (id, real date, the title it was read from)
CORRECTIONS: list[tuple[str, str, str]] = [
    ("e0b45dcc-6b5c-4fba-904c-3298f0eeda6c", "2025-08-26", "2025 Aug 26"),
    ("49d5a8a4-1f34-41be-b466-b788d880b821", "2025-09-24", "Iteration (sep 24)"),
    ("096ecace-ad5f-4bd1-9c2b-b8e3cd338e16", "2025-09-08", "Iteration 49 (Sep 8-11)"),
]

_STAMPED = "2026-07-15"


def upgrade() -> None:
    for note_id, real_date, _title in CORRECTIONS:
        op.execute(
            sa.text(
                "UPDATE wild_life.notes SET entry_date = CAST(:d AS date) "
                "WHERE id = CAST(:i AS uuid)"
            ).bindparams(d=real_date, i=note_id)
        )


def downgrade() -> None:
    for note_id, _real_date, _title in CORRECTIONS:
        op.execute(
            sa.text(
                "UPDATE wild_life.notes SET entry_date = CAST(:d AS date) "
                "WHERE id = CAST(:i AS uuid)"
            ).bindparams(d=_STAMPED, i=note_id)
        )
