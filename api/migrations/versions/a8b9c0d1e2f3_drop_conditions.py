"""drop the conditions table and the columns that pointed at it

The second half of `f7a8b9c0d1e2`, deliberately separate: that revision writes the
programs and leaves every source in place so the two can be read against each
other. This one removes them, and refuses to run if anything still points at a
condition — a root left dangling is data you can no longer reach.

Revision ID: a8b9c0d1e2f3
Revises: f7a8b9c0d1e2
Create Date: 2026-07-26
"""

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op

revision: str = "a8b9c0d1e2f3"
down_revision: str | None = "f7a8b9c0d1e2"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None

SOFT_POLY = (
    ("notes", "entity_type"),
    ("note_mentions", "target_type"),
    ("entity_tags", "entity_type"),
    ("commitments", "entity_type"),
    ("requests", "entity_type"),
    ("delegations", "entity_type"),
    ("resources", "entity_type"),
    ("decisions", "entity_type"),
    ("events", "entity_type"),
    ("outcomes", "entity_type"),
    ("entity_links", "target_type"),
    ("entity_links", "source_type"),
)


def upgrade() -> None:
    conn = op.get_bind()

    conditions = conn.execute(sa.text("SELECT count(*) FROM wild_life.conditions")).scalar()
    carried = conn.execute(
        sa.text("SELECT count(*) FROM wild_life._condition_program_map")
    ).scalar()
    if conditions != carried:
        raise RuntimeError(
            f"{conditions} conditions but {carried} carried across — run f7a8b9c0d1e2 first"
        )

    # Anything still rooted to a condition would be orphaned by the drop.
    stranded: list[str] = []
    for table, tcol in SOFT_POLY:
        n = conn.execute(
            sa.text(f"SELECT count(*) FROM wild_life.{table} WHERE {tcol} = 'condition'")
        ).scalar()
        if n:
            stranded.append(f"{table}.{tcol}={n}")
    for table in ("metrics", "protocols", "medications"):
        n = conn.execute(
            sa.text(
                f"SELECT count(*) FROM wild_life.{table} "
                f"WHERE condition_id IS NOT NULL AND program_id IS NULL"
            )
        ).scalar()
        if n:
            stranded.append(f"{table}.condition_id={n}")
    if stranded:
        raise RuntimeError(f"still pointing at conditions: {', '.join(stranded)}")

    for table in ("metrics", "protocols", "medications"):
        op.drop_column(table, "condition_id", schema="wild_life")
    op.drop_column("metrics", "area_id", schema="wild_life")
    op.drop_column("metrics", "program_id", schema="wild_life")
    op.drop_column("programs", "target_date", schema="wild_life")
    op.drop_table("conditions", schema="wild_life")
    op.drop_table("_condition_program_map", schema="wild_life")


def downgrade() -> None:
    # Structure only — the rows live on as programs.
    op.add_column("programs", sa.Column("target_date", sa.Date(), nullable=True), schema="wild_life")
    op.add_column("metrics", sa.Column("program_id", sa.UUID(), nullable=True), schema="wild_life")
    op.add_column("metrics", sa.Column("area_id", sa.UUID(), nullable=True), schema="wild_life")
    op.create_table(
        "conditions",
        sa.Column("id", sa.UUID(), server_default=sa.text("gen_random_uuid()"), nullable=False),
        sa.Column("name", sa.Text(), nullable=False),
        sa.Column("category", sa.Text(), nullable=True),
        sa.Column("status", sa.Text(), server_default="active", nullable=False),
        sa.Column("area_id", sa.UUID(), nullable=True),
        sa.Column("program_id", sa.UUID(), nullable=True),
        sa.Column("severity", sa.Text(), nullable=True),
        sa.Column("onset_date", sa.Date(), nullable=True),
        sa.Column("resolved_date", sa.Date(), nullable=True),
        sa.Column("diagnosed_by_id", sa.UUID(), nullable=True),
        sa.Column("description", sa.Text(), nullable=True),
        sa.Column("notes", sa.Text(), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
        sa.PrimaryKeyConstraint("id"),
        schema="wild_life",
    )
    for table in ("metrics", "protocols", "medications"):
        op.add_column(table, sa.Column("condition_id", sa.UUID(), nullable=True), schema="wild_life")
