"""rules: one cadence, freed from protocol

Generalises ``Routine`` into **the rule** — the one cadence expression for
everything that recurs (decision 9). Three things change:

- ``protocol_id`` becomes nullable. Every routine had to be a step of a protocol,
  so a weekly habit posed as a clinical one and its liveness could only ever be
  the protocol's. Liveness is now the rule's own, narrowed by a protocol when
  there is one — which is a pure extension today: all 21 routines are
  protocol-bound and none carries its own window or a non-active status, so
  ``compute_regimen`` output is bit-identical across this migration.
- ``kind`` says what MomentKind the rule generates. Stored rather than inferred
  from which FK is filled, because the whole point is that an `occasion` rule has
  neither a medication nor a protocol, and ``medication_id IS NOT NULL`` cannot
  name it.
- ``rule_links`` gives a rule the same four closed roles a moment has, so it can
  declare what its generated moments involve. An occasion rule concerns what the
  meeting is about, everyone expected at it, and where — none of which three
  typed FKs can express.

Nothing is dropped and no behaviour changes; the calendar still writes ``events``
until its own step.

Revision ID: 1ec77e09ce82
Revises: ef10e3e3ef25
Create Date: 2026-07-28 14:05:57.228056
"""

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op

revision: str = "1ec77e09ce82"
down_revision: str | None = "ef10e3e3ef25"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None

SCHEMA = "wild_life"


def upgrade() -> None:
    op.alter_column(
        "routines",
        "protocol_id",
        existing_type=sa.dialects.postgresql.UUID(as_uuid=True),
        nullable=True,
        schema=SCHEMA,
    )
    op.add_column(
        "routines",
        sa.Column("kind", sa.Text(), server_default="activity", nullable=False),
        schema=SCHEMA,
    )
    # What each existing rule already generates, by the same test the moment
    # backfill uses: a routine instance with a medication is a dose, without is an
    # activity. Read from the routine *or* its medication link, which is the
    # distinction that made the backfill count 38 doses rather than 37.
    op.execute(
        f"UPDATE {SCHEMA}.routines SET kind = 'dose' WHERE medication_id IS NOT NULL"
    )
    op.create_index("ix_routines_kind", "routines", ["kind"], schema=SCHEMA)

    op.create_table(
        "rule_links",
        sa.Column(
            "id",
            sa.dialects.postgresql.UUID(as_uuid=True),
            primary_key=True,
            server_default=sa.text("gen_random_uuid()"),
        ),
        sa.Column(
            "rule_id",
            sa.dialects.postgresql.UUID(as_uuid=True),
            sa.ForeignKey(f"{SCHEMA}.routines.id", ondelete="CASCADE"),
            nullable=False,
        ),
        sa.Column("role", sa.Text(), nullable=False),
        sa.Column("entity_type", sa.Text(), nullable=False),
        sa.Column(
            "entity_id", sa.dialects.postgresql.UUID(as_uuid=True), nullable=False
        ),
        sa.UniqueConstraint(
            "rule_id", "role", "entity_type", "entity_id", name="uq_rule_links_edge"
        ),
        schema=SCHEMA,
    )
    op.create_index("ix_rule_links_rule", "rule_links", ["rule_id"], schema=SCHEMA)
    op.create_index(
        "ix_rule_links_target",
        "rule_links",
        ["entity_type", "entity_id"],
        schema=SCHEMA,
    )

    # The subject a dose rule already has, stated in the role vocabulary. The
    # typed FK stays — the regimen reads it — so this is additive, and the
    # generated moment's `subject` link now has one place to come from.
    op.execute(f"""
        INSERT INTO {SCHEMA}.rule_links (rule_id, role, entity_type, entity_id)
        SELECT id, 'subject', 'medication', medication_id
        FROM {SCHEMA}.routines WHERE medication_id IS NOT NULL
        ON CONFLICT ON CONSTRAINT uq_rule_links_edge DO NOTHING
    """)


def downgrade() -> None:
    op.drop_table("rule_links", schema=SCHEMA)
    op.drop_index("ix_routines_kind", "routines", schema=SCHEMA)
    op.drop_column("routines", "kind", schema=SCHEMA)
    # Only reversible while every rule still has a protocol; a rule authored
    # without one has nothing to put back, which is the point of the change.
    op.alter_column(
        "routines",
        "protocol_id",
        existing_type=sa.dialects.postgresql.UUID(as_uuid=True),
        nullable=False,
        schema=SCHEMA,
    )
