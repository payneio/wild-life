"""recover work-journal dates the importer wrote into the prose

388 notes carry a marker of the form "(Backfilled from Work Journal 2025-12-12)"
and an `entry_date` of 2026-07-17 — the day the import ran. Ten months of work
journal, from 2025-09-24 to 2026-07-16, collapsed onto a single day.

The importer knew the real date; it just had nowhere to put it, so it wrote it
into the body and stamped the column with "now". Same failure as `d7e8f9a0b1c2`
from the other direction: a date that exists is discarded in favour of one that
is merely available. Every one of the 388 is parseable, so all of it comes back.

The marker itself is left in the prose. Once the date is in `entry_date` the date
half is redundant, but "this came from the Work Journal" is provenance the column
does not carry, and editing 388 people's sentences to save a line is not a trade
worth making silently.

Revision ID: d3e4f5a7b8c9
Revises: c2d3e4f5a7b8
Create Date: 2026-07-27
"""

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op

revision: str = "d3e4f5a7b8c9"
down_revision: str | None = "c2d3e4f5a7b8"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None

_MARKER = r"Backfilled from Work Journal ([0-9]{4}-[0-9]{2}-[0-9]{2})"


def upgrade() -> None:
    # Record what we overwrite, so the downgrade restores per row rather than
    # assuming every one of them was the import date.
    op.execute(
        sa.text(
            """
            CREATE TABLE wild_life._work_journal_dates AS
            SELECT id, entry_date FROM wild_life.notes
             WHERE body ~ :marker
            """
        ).bindparams(marker=_MARKER)
    )
    op.execute(
        sa.text(
            """
            UPDATE wild_life.notes
               SET entry_date = CAST(substring(body FROM :marker) AS date)
             WHERE body ~ :marker
               AND substring(body FROM :marker) IS NOT NULL
            """
        ).bindparams(marker=_MARKER)
    )


def downgrade() -> None:
    op.execute(
        sa.text(
            """
            UPDATE wild_life.notes n
               SET entry_date = b.entry_date
              FROM wild_life._work_journal_dates b
             WHERE n.id = b.id
            """
        )
    )
    op.execute(sa.text("DROP TABLE wild_life._work_journal_dates"))
