"""a touched occurrence is a moment against its rule

The replacement for iCal's override row, and the reason we do not need one.

RFC 5545 needs ``RECURRENCE-ID`` + ``EXDATE`` + a second VEVENT because a series
has no other way to say "this one is different": the occurrences do not exist as
records, so a changed one has to be described by exclusion and re-statement. Our
model already says it — rules are computed and never materialised (decision 10),
and a projected occurrence becomes a row **only when something happens to it**.
So:

- untouched     → no row at all; the calendar computes it from the rule
- moved/renamed → a moment carrying ``rule_id`` and the slot it stands for
- cancelled     → the same, with ``withdrawn_at`` set (decision 14: abandoning by
  choice is an act, and worth telling apart from a date quietly passing)

``occurrence_at`` is the *original* projected instant, not the new one, because
it is the identity of the slot being replaced — moving a meeting must not change
which occurrence it is. Unique per rule, so materialising twice is idempotent.

Measured before writing: ``recurrence_parent_id`` is set on **0 of 1,332** events.
That is not dead code; it is the shape being wrong. Every one of the 74 series
that ever needed an exception expressed it as an EXDATE, because creating the
paired override row by hand is work nobody does.

Revision ID: d2736a24fd5e
Revises: ea70e4ab415f
"""

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op

revision: str = "d2736a24fd5e"
down_revision: str | None = "ea70e4ab415f"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None

SCHEMA = "wild_life"


def upgrade() -> None:
    op.add_column(
        "moments",
        sa.Column(
            "rule_id",
            sa.dialects.postgresql.UUID(as_uuid=True),
            sa.ForeignKey(f"{SCHEMA}.routines.id", ondelete="CASCADE"),
        ),
        schema=SCHEMA,
    )
    op.add_column(
        "moments",
        sa.Column("occurrence_at", sa.DateTime(timezone=True)),
        schema=SCHEMA,
    )
    op.create_index(
        "uq_moments_rule_occurrence",
        "moments",
        ["rule_id", "occurrence_at"],
        unique=True,
        schema=SCHEMA,
    )


def downgrade() -> None:
    op.drop_index("uq_moments_rule_occurrence", "moments", schema=SCHEMA)
    op.drop_column("moments", "occurrence_at", schema=SCHEMA)
    op.drop_column("moments", "rule_id", schema=SCHEMA)
