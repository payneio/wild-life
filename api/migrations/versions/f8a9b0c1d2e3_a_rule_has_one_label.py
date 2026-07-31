"""A rule has one label, in the column named for it.

`routines` carried the human label in two columns and every reader spelled the
same fallback: `rule.activity or rule.name`. `activity` was worse than a
duplicate — it is named after one of the three values of `kind`, so for an
`occasion` rule it held a meeting title, which is not an activity at all, and
for a `dose` rule it held nothing because the label is the medication's name.

This is the `notes`-column rule in AGENTS.md, arriving under a different word: a
field whose name does not say what it holds ends up holding whatever needs a
home. It escaped that rule only because the rule was written about the word
`notes`.

`activity` wins the merge because every reader preferred it, so display is
unchanged: 73 rows carry it alone, 4 carry it identically alongside `name`, 1
has `name` only, and 14 have neither and take their label from the medication
they schedule.

Revision ID: f8a9b0c1d2e3
Revises: e7f8a9b0c1d2
"""

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op

revision: str = "f8a9b0c1d2e3"
down_revision: str | None = "e7f8a9b0c1d2"
branch_labels: Sequence[str] | None = None
depends_on: Sequence[str] | None = None


def upgrade() -> None:
    # `activity` first, matching every reader's `activity or name`.
    op.execute("""
        UPDATE wild_life.routines
           SET name = coalesce(activity, name)
         WHERE activity IS NOT NULL
    """)
    op.drop_column("routines", "activity", schema="wild_life")


def downgrade() -> None:
    """Restores the column, empty.

    Which rows *were* `activity` is not recoverable from `name` alone — that is
    what merging them means — and inventing a rule to split them back would be a
    guess dressed as a migration.
    """
    op.add_column(
        "routines",
        sa.Column("activity", sa.Text(), nullable=True),
        schema="wild_life",
    )
