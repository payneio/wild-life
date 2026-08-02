"""A standing claim has a truth history, not a completion date.

`docs/model.md` A3. Satisfaction follows monotonicity: a *target* becomes true
and stays true, so one timestamp says everything about it. A *standard* — "no
important relationship neglected", "LDL under 100" — is true or false today and
can become false again, so a completion date is a category error for it.

The evidence that it was one: `Outcome.satisfied_at` is set on **none** of the
twenty-one outcomes in the corpus, and the comment above it claimed an outcome
was "worth dating whichever kind it is". Nothing had ever dated one, because for
eleven of them there is no date to give.

Evaluations are written at review, because A3's evaluation and A1's examination
are the same act: looking at a scope is when its standing claims get a truth
value. `holds` is nullable on purpose — "looked, could not tell" is a different
answer from "no", and collapsing them would lose the case that most wants
following up.

Revision ID: f0e1d2c3b4a5
Revises: e5d4c3b2a1f0
"""

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op

revision: str = "f0e1d2c3b4a5"
down_revision: str | None = "e5d4c3b2a1f0"
branch_labels: Sequence[str] | None = None
depends_on: Sequence[str] | None = None


def upgrade() -> None:
    op.create_table(
        "outcome_evaluations",
        sa.Column(
            "id",
            sa.UUID(),
            primary_key=True,
            server_default=sa.text("gen_random_uuid()"),
        ),
        sa.Column(
            "outcome_id",
            sa.UUID(),
            sa.ForeignKey("wild_life.outcomes.id", ondelete="CASCADE"),
            nullable=False,
        ),
        sa.Column("evaluated_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("holds", sa.Boolean(), nullable=True),
        sa.Column("note", sa.Text(), nullable=True),
        sa.Column(
            "created_at", sa.DateTime(timezone=True), server_default=sa.text("now()")
        ),
        sa.Column(
            "updated_at", sa.DateTime(timezone=True), server_default=sa.text("now()")
        ),
        schema="wild_life",
    )
    op.create_index(
        "ix_outcome_evaluations_outcome",
        "outcome_evaluations",
        ["outcome_id", "evaluated_at"],
        schema="wild_life",
    )


def downgrade() -> None:
    op.drop_table("outcome_evaluations", schema="wild_life")
