"""unify routines M1 — additive: cadence/dose fields on routines, slot on
instances, condition_id on metrics + goals

Stage 1 of the health+productivity IA unification. Purely additive and safe: a
Routine gains the dose-line + FHIR cadence fields (so it can be a med dose /
supplement / activity / habit), a RoutineInstance gains a ``slot``, and Metric +
Goal gain ``condition_id``. No behavior change — the regimen engine still reads
protocol_items until Stage 2.

Revision ID: a7d1e94c2f36
Revises: e4b7c1a90d23
Create Date: 2026-07-19
"""

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects import postgresql

revision = "a7d1e94c2f36"
down_revision = "e4b7c1a90d23"
branch_labels = None
depends_on = None

SCHEMA = "wild_life"


def upgrade() -> None:
    # --- routines: gain dose-line + structured cadence -----------------------
    op.add_column("routines", sa.Column("activity", sa.Text()), schema=SCHEMA)
    op.add_column(
        "routines",
        sa.Column(
            "medication_id",
            postgresql.UUID(as_uuid=True),
            sa.ForeignKey(f"{SCHEMA}.medications.id", ondelete="SET NULL"),
        ),
        schema=SCHEMA,
    )
    op.add_column(
        "routines",
        sa.Column(
            "protocol_id",
            postgresql.UUID(as_uuid=True),
            sa.ForeignKey(f"{SCHEMA}.protocols.id", ondelete="CASCADE"),
        ),
        schema=SCHEMA,
    )
    op.add_column("routines", sa.Column("amount", sa.Numeric()), schema=SCHEMA)
    op.add_column(
        "routines",
        sa.Column("timing", postgresql.ARRAY(sa.Text()), server_default="{}"),
        schema=SCHEMA,
    )
    op.add_column(
        "routines",
        sa.Column("days_of_week", postgresql.ARRAY(sa.Text()), server_default="{}"),
        schema=SCHEMA,
    )
    op.add_column(
        "routines",
        sa.Column(
            "interval_days", sa.Integer(), server_default="1", nullable=False
        ),
        schema=SCHEMA,
    )
    op.add_column(
        "routines",
        sa.Column("as_needed", sa.Boolean(), server_default="false", nullable=False),
        schema=SCHEMA,
    )
    op.add_column("routines", sa.Column("trigger", sa.Text()), schema=SCHEMA)
    op.add_column(
        "routines",
        sa.Column("sort_order", sa.Integer(), server_default="0", nullable=False),
        schema=SCHEMA,
    )
    op.create_index(
        "ix_routines_medication_id", "routines", ["medication_id"], schema=SCHEMA
    )
    op.create_index(
        "ix_routines_protocol_id", "routines", ["protocol_id"], schema=SCHEMA
    )
    # name is no longer required (medication routines label off the med).
    op.alter_column("routines", "name", nullable=True, schema=SCHEMA)

    # --- routine_instances: gain a slot (meds carry one; habits use '') ------
    op.add_column(
        "routine_instances",
        sa.Column("slot", sa.Text(), server_default="", nullable=False),
        schema=SCHEMA,
    )

    # --- metrics + goals: link to a condition --------------------------------
    for table in ("metrics", "goals"):
        op.add_column(
            table,
            sa.Column(
                "condition_id",
                postgresql.UUID(as_uuid=True),
                sa.ForeignKey(f"{SCHEMA}.conditions.id", ondelete="SET NULL"),
            ),
            schema=SCHEMA,
        )
        op.create_index(
            f"ix_{table}_condition_id", table, ["condition_id"], schema=SCHEMA
        )


def downgrade() -> None:
    for table in ("metrics", "goals"):
        op.drop_index(f"ix_{table}_condition_id", table_name=table, schema=SCHEMA)
        op.drop_column(table, "condition_id", schema=SCHEMA)

    op.drop_column("routine_instances", "slot", schema=SCHEMA)

    op.alter_column("routines", "name", nullable=False, schema=SCHEMA)
    op.drop_index("ix_routines_protocol_id", table_name="routines", schema=SCHEMA)
    op.drop_index("ix_routines_medication_id", table_name="routines", schema=SCHEMA)
    for col in (
        "sort_order", "trigger", "as_needed", "interval_days", "days_of_week",
        "timing", "amount", "protocol_id", "medication_id", "activity",
    ):
        op.drop_column("routines", col, schema=SCHEMA)
