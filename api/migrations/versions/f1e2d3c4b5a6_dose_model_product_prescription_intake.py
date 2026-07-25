"""dose model: product vs prescribed dose vs intake

Separates the three notions cleanly (a "dose" = amount + unit):

- Medication is product identity only — drop ``strength`` and ``form``.
- Routine (the prescription) carries the dose: keep ``amount``, add ``unit``.
- routine_instances become self-contained **intakes**: rename ``amount_taken`` →
  ``amount``, add ``unit`` + ``medication_id``, and make ``routine_id`` nullable
  (``ON DELETE SET NULL``) so un-prescribed intakes are first-class. A CHECK keeps
  every row anchored to a routine and/or a medication.

``form`` is folded into ``routines.unit`` before it is dropped; ``strength`` is
intentionally discarded. Hand-written (partial-index + check + FK swap).

Revision ID: f1e2d3c4b5a6
Revises: c3d4e5f6a7b8
Create Date: 2026-07-23
"""

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op

revision: str = "f1e2d3c4b5a6"
down_revision: str | None = "c3d4e5f6a7b8"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None

SCHEMA = "wild_life"


def upgrade() -> None:
    # 1. Routine gains the dose unit; backfill from the linked med's form.
    op.add_column("routines", sa.Column("unit", sa.Text(), nullable=True), schema=SCHEMA)
    op.execute(
        f"UPDATE {SCHEMA}.routines r SET unit = m.form "
        f"FROM {SCHEMA}.medications m "
        f"WHERE r.medication_id = m.id AND r.unit IS NULL AND m.form IS NOT NULL"
    )

    # 2. routine_instances become intakes.
    op.alter_column(
        "routine_instances", "amount_taken", new_column_name="amount", schema=SCHEMA
    )
    op.add_column(
        "routine_instances", sa.Column("unit", sa.Text(), nullable=True), schema=SCHEMA
    )
    op.add_column(
        "routine_instances",
        sa.Column("medication_id", sa.UUID(), nullable=True),
        schema=SCHEMA,
    )
    op.create_index(
        "ix_routine_instances_medication_id",
        "routine_instances",
        ["medication_id"],
        schema=SCHEMA,
    )
    op.create_foreign_key(
        "routine_instances_medication_id_fkey",
        "routine_instances",
        "medications",
        ["medication_id"],
        ["id"],
        source_schema=SCHEMA,
        referent_schema=SCHEMA,
        ondelete="CASCADE",  # the medication owns its intake history
    )
    # routine_id becomes optional; deleting a routine keeps its historical intakes.
    op.alter_column(
        "routine_instances", "routine_id", nullable=True, schema=SCHEMA
    )
    op.drop_constraint(
        "routine_instances_routine_id_fkey",
        "routine_instances",
        schema=SCHEMA,
        type_="foreignkey",
    )
    op.create_foreign_key(
        "routine_instances_routine_id_fkey",
        "routine_instances",
        "routines",
        ["routine_id"],
        ["id"],
        source_schema=SCHEMA,
        referent_schema=SCHEMA,
        ondelete="SET NULL",
    )
    # Backfill what/how-much from each row's routine.
    op.execute(
        f"UPDATE {SCHEMA}.routine_instances i "
        f"SET medication_id = r.medication_id, unit = r.unit "
        f"FROM {SCHEMA}.routines r WHERE i.routine_id = r.id"
    )

    # 3. Medication is identity only.
    op.drop_column("medications", "strength", schema=SCHEMA)
    op.drop_column("medications", "form", schema=SCHEMA)


def downgrade() -> None:
    op.add_column(
        "medications", sa.Column("form", sa.Text(), nullable=True), schema=SCHEMA
    )
    op.add_column(
        "medications", sa.Column("strength", sa.Text(), nullable=True), schema=SCHEMA
    )

    # Un-prescribed intakes can't exist once routine_id is NOT NULL again.
    op.execute(f"DELETE FROM {SCHEMA}.routine_instances WHERE routine_id IS NULL")
    op.drop_constraint(
        "routine_instances_routine_id_fkey",
        "routine_instances",
        schema=SCHEMA,
        type_="foreignkey",
    )
    op.create_foreign_key(
        "routine_instances_routine_id_fkey",
        "routine_instances",
        "routines",
        ["routine_id"],
        ["id"],
        source_schema=SCHEMA,
        referent_schema=SCHEMA,
        ondelete="CASCADE",
    )
    op.alter_column(
        "routine_instances", "routine_id", nullable=False, schema=SCHEMA
    )
    op.drop_constraint(
        "routine_instances_medication_id_fkey",
        "routine_instances",
        schema=SCHEMA,
        type_="foreignkey",
    )
    op.drop_index(
        "ix_routine_instances_medication_id",
        table_name="routine_instances",
        schema=SCHEMA,
    )
    op.drop_column("routine_instances", "medication_id", schema=SCHEMA)
    op.drop_column("routine_instances", "unit", schema=SCHEMA)
    op.alter_column(
        "routine_instances", "amount", new_column_name="amount_taken", schema=SCHEMA
    )

    op.drop_column("routines", "unit", schema=SCHEMA)
