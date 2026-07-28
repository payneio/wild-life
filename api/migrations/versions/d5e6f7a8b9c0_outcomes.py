"""outcomes: one object for what must be true, and metrics keep a reference band

Creates `outcomes` and moves every statement of "what good looks like" into it:
the six goals, plus the prose that said the same thing in `success_criteria`,
`completion_criteria` and `desired_standard`. Metric's `target_min`/`target_max`
become `reference_min`/`reference_max` — the world's normal band, as distinct from
my claim, which now lives on the outcome.

Nothing is dropped here. The source columns and the `goals` table survive this
revision so the result can be read against them; `e6f7a8b9c0d1` removes them.

Revision ID: d5e6f7a8b9c0
Revises: c8e9f0a1b2d3
Create Date: 2026-07-26
"""

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op

revision: str = "d5e6f7a8b9c0"
down_revision: str | None = "c8e9f0a1b2d3"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.create_table(
        "outcomes",
        sa.Column(
            "id",
            sa.UUID(),
            server_default=sa.text("gen_random_uuid()"),
            nullable=False,
        ),
        sa.Column("statement", sa.Text(), nullable=False),
        sa.Column("kind", sa.Text(), nullable=False),
        sa.Column("description", sa.Text(), nullable=True),
        sa.Column("entity_type", sa.Text(), nullable=False),
        sa.Column("entity_id", sa.UUID(), nullable=False),
        sa.Column("status", sa.Text(), server_default="active", nullable=False),
        sa.Column("metric_id", sa.UUID(), nullable=True),
        sa.Column("target_min", sa.Float(), nullable=True),
        sa.Column("target_max", sa.Float(), nullable=True),
        sa.Column("baseline", sa.Float(), nullable=True),
        sa.Column("by_when", sa.Date(), nullable=True),
        sa.Column("satisfied_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            server_default=sa.text("now()"),
            nullable=False,
        ),
        sa.Column(
            "updated_at",
            sa.DateTime(timezone=True),
            server_default=sa.text("now()"),
            nullable=False,
        ),
        sa.ForeignKeyConstraint(
            ["metric_id"], ["wild_life.metrics.id"], ondelete="SET NULL"
        ),
        sa.PrimaryKeyConstraint("id"),
        schema="wild_life",
    )
    op.create_index(
        "ix_outcomes_root", "outcomes", ["entity_type", "entity_id"], schema="wild_life"
    )
    op.create_index(
        "ix_wild_life_outcomes_metric_id", "outcomes", ["metric_id"], schema="wild_life"
    )

    # A metric's band was always the world's, not mine.
    op.alter_column(
        "metrics", "target_min", new_column_name="reference_min", schema="wild_life"
    )
    op.alter_column(
        "metrics", "target_max", new_column_name="reference_max", schema="wild_life"
    )

    # Area gains the prose "why" that Program, Project and Protocol already have,
    # so `desired_standard` can become claims without losing its narrative half.
    op.add_column(
        "areas",
        sa.Column("intended_outcome", sa.Text(), nullable=True),
        schema="wild_life",
    )

    conn = op.get_bind()

    # --- goals → outcomes ---------------------------------------------------
    # kind: a goal with a number to reach is a target; one without is a standard
    # it should simply hold. Root: the program if there is one, else the area —
    # no goal carries a condition, so that branch would be dead weight.
    goals = (
        conn.execute(
            sa.text(
                "SELECT id, name, description, area_id, program_id, metric_id, "
                "target_state, target_value, baseline, target_date, status, "
                "measurement_method FROM wild_life.goals"
            )
        )
        .mappings()
        .all()
    )

    for g in goals:
        aiming_down = g["baseline"] is None or (
            g["target_value"] is not None and g["baseline"] > g["target_value"]
        )
        target_min = None
        target_max = None
        if g["target_value"] is not None:
            if aiming_down:
                target_max = g["target_value"]
            else:
                target_min = g["target_value"]
        # `target_state` restates the name in every row we have; keep it only if
        # it says something the name doesn't.
        description = g["description"]
        if g["target_state"] and g["target_state"].strip() != (g["name"] or "").strip():
            description = "\n\n".join(x for x in (description, g["target_state"]) if x)
        if g["measurement_method"]:
            description = "\n\n".join(
                x for x in (description, g["measurement_method"]) if x
            )
        root_type = "program" if g["program_id"] else "area"
        root_id = g["program_id"] or g["area_id"]
        if root_id is None:
            continue  # nothing to belong to; the drop revision reports it
        conn.execute(
            sa.text(
                "INSERT INTO wild_life.outcomes (statement, kind, description, "
                "entity_type, entity_id, status, metric_id, target_min, target_max, "
                "baseline, by_when) VALUES (:statement, :kind, :description, "
                ":entity_type, :entity_id, :status, :metric_id, :target_min, "
                ":target_max, :baseline, :by_when)"
            ),
            {
                "statement": g["name"],
                "kind": "target" if g["target_value"] is not None else "standard",
                "description": description,
                "entity_type": root_type,
                "entity_id": root_id,
                "status": g["status"],
                "metric_id": g["metric_id"],
                "target_min": target_min,
                "target_max": target_max,
                "baseline": g["baseline"],
                "by_when": g["target_date"],
            },
        )

    # --- prose criteria → outcomes -----------------------------------------
    # One outcome per prose field, verbatim. Splitting "A, B and C" into three
    # claims is exactly the kind of guess that goes wrong quietly; the statement
    # is preserved whole and can be split by hand where it's worth it.
    #
    # A program that already carries goal-derived outcomes has its criteria in
    # structured form already — Cardiovascular's `success_criteria` *is* its three
    # goals, retyped — so migrating it too would recreate the duplication this
    # change exists to remove.
    def migrate_prose(table: str, column: str, root_type: str, kind: str) -> None:
        rows = (
            conn.execute(
                sa.text(
                    f"SELECT id, {column} AS text FROM wild_life.{table} "
                    f"WHERE {column} IS NOT NULL AND {column} <> ''"
                )
            )
            .mappings()
            .all()
        )
        for r in rows:
            already = conn.execute(
                sa.text(
                    "SELECT count(*) FROM wild_life.outcomes "
                    "WHERE entity_type = :t AND entity_id = :i"
                ),
                {"t": root_type, "i": r["id"]},
            ).scalar()
            if already:
                continue
            conn.execute(
                sa.text(
                    "INSERT INTO wild_life.outcomes (statement, kind, entity_type, "
                    "entity_id, status) VALUES (:s, :k, :t, :i, 'active')"
                ),
                {"s": r["text"].strip(), "k": kind, "t": root_type, "i": r["id"]},
            )

    migrate_prose("programs", "success_criteria", "program", "target")
    migrate_prose("projects", "completion_criteria", "project", "deliverable")
    migrate_prose("areas", "desired_standard", "area", "standard")

    # --- metric target_value -------------------------------------------------
    # A preferred point inside a reference band (blood pressure's 115 within
    # 90–130). It isn't a band and it isn't a claim, so it is recorded on the
    # outcome that covers the metric rather than invented into one.
    for m in (
        conn.execute(
            sa.text(
                "SELECT id, name, target_value, area_id, program_id, condition_id "
                "FROM wild_life.metrics WHERE target_value IS NOT NULL"
            )
        )
        .mappings()
        .all()
    ):
        note = f"Preferred value: {m['target_value']:g}"
        covering = (
            conn.execute(
                sa.text("SELECT id FROM wild_life.outcomes WHERE metric_id = :m"),
                {"m": m["id"]},
            )
            .scalars()
            .all()
        )
        if covering:
            conn.execute(
                sa.text(
                    "UPDATE wild_life.outcomes SET description = "
                    "concat_ws(E'\\n\\n', description, CAST(:note AS text)) "
                    "WHERE metric_id = :m"
                ),
                {"note": note, "m": m["id"]},
            )
            continue
        root_type = (
            "condition"
            if m["condition_id"]
            else "program"
            if m["program_id"]
            else "area"
        )
        root_id = m["condition_id"] or m["program_id"] or m["area_id"]
        if root_id is None:
            continue
        conn.execute(
            sa.text(
                "INSERT INTO wild_life.outcomes (statement, kind, description, "
                "entity_type, entity_id, status, metric_id, target_min, target_max) "
                "SELECT :s, 'standard', :note, :t, :i, 'active', :m, "
                "reference_min, reference_max FROM wild_life.metrics WHERE id = :m"
            ),
            {
                "s": f"{m['name']} in range",
                "note": note,
                "t": root_type,
                "i": root_id,
                "m": m["id"],
            },
        )


def downgrade() -> None:
    op.drop_column("areas", "intended_outcome", schema="wild_life")
    op.alter_column(
        "metrics", "reference_min", new_column_name="target_min", schema="wild_life"
    )
    op.alter_column(
        "metrics", "reference_max", new_column_name="target_max", schema="wild_life"
    )
    op.drop_index("ix_wild_life_outcomes_metric_id", "outcomes", schema="wild_life")
    op.drop_index("ix_outcomes_root", "outcomes", schema="wild_life")
    op.drop_table("outcomes", schema="wild_life")
