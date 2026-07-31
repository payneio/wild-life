"""An ending has a cause, and a revision is not an ending.

`docs/model.md` A5. `completed` and `cancelled` could say *that* a commitment
ended and never *why*, so the three endings that matter collapsed into one
status: abandoning something on purpose, having it voided because the thing it
was about ceased to exist, and letting it lapse unnoticed all looked identical
afterwards. A6 needs that distinction, because valence attaches to the cause —
dropping a commitment you should never have made is good judgment, and letting
the same one rot is not.

`ending_cause` is `discharged` · `abandoned` · `voided`. **Not `revised`**,
which the axiom listed and should not have: a revised commitment continues. The
deck moving from the 14th to the 21st is still owed on the 21st, so recording
that as an ending would close something still open. Revisions are acts written
about the intention, which is where A6 puts appraisal too.

`lapsed` stays derived and unwritten — a lapse is a silence, and the whole point
is telling it apart from a decision.

Revision ID: b3a4c5d6e7f8
Revises: f0e1d2c3b4a5
"""

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op

revision: str = "b3a4c5d6e7f8"
down_revision: str | None = "f0e1d2c3b4a5"
branch_labels: Sequence[str] | None = None
depends_on: Sequence[str] | None = None

_TABLES = ("tasks", "outcomes")


def upgrade() -> None:
    for t in _TABLES:
        op.add_column(
            t, sa.Column("ending_cause", sa.Text(), nullable=True), schema="wild_life"
        )
        op.add_column(
            t, sa.Column("ending_note", sa.Text(), nullable=True), schema="wild_life"
        )

    # What the existing statuses already imply, and no more. A cancelled task was
    # abandoned *or* voided and the column cannot tell which — so it says neither
    # rather than guessing, and the distinction begins from here.
    op.execute(
        "UPDATE wild_life.tasks SET ending_cause='discharged'"
        " WHERE completed_at IS NOT NULL"
    )
    op.execute(
        "UPDATE wild_life.outcomes SET ending_cause='discharged'"
        " WHERE satisfied_at IS NOT NULL"
    )


def downgrade() -> None:
    for t in _TABLES:
        op.drop_column(t, "ending_note", schema="wild_life")
        op.drop_column(t, "ending_cause", schema="wild_life")
