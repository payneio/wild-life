"""conditions become programs, and a metric gets one root

A condition and a program are the same object: something you have decided to pay
attention to. Every health program was already a shadow of one — Cardiovascular
health held the measurements while Hyperlipidemia held the treatment, and you had
to remember which half lived where.

Metric loses the area/program/condition triple for a single soft-poly root, which
is what let cholesterol be filed against a program while methane was filed against
a condition.

Nothing is dropped here. `conditions` and the old columns survive this revision so
the result can be read against them; `a8b9c0d1e2f3` removes them.

Revision ID: f7a8b9c0d1e2
Revises: a7b8c9d0e1f2
Create Date: 2026-07-26
"""

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op

revision: str = "f7a8b9c0d1e2"
down_revision: str | None = "a7b8c9d0e1f2"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None

# condition status -> program status. `chronic` disappears deliberately: it said how
# long a thing lasts, not what state it is in. A chronic condition you are treating
# is active; one you are only watching is monitoring.
STATUS = {
    "active": "active",
    "monitoring": "monitoring",
    "resolved": "resolved",
    "ruled_out": "cancelled",
}


def _status_for(conn, c) -> str:
    """`chronic` splits on whether anything is actually running for it.

    Chronic said how long a thing lasts, which is orthogonal to what state it is
    in — so it maps by evidence rather than by table lookup. A chronic condition
    with a protocol or a medication is one you are treating (`active`); one with
    neither is one you are carrying and watching (`monitoring`).
    """
    if c["status"] != "chronic":
        return STATUS.get(c["status"], "active")
    treated = conn.execute(
        sa.text(
            "SELECT EXISTS (SELECT 1 FROM wild_life.protocols WHERE condition_id = :c) "
            "OR EXISTS (SELECT 1 FROM wild_life.medications WHERE condition_id = :c)"
        ),
        {"c": c["id"]},
    ).scalar()
    return "active" if treated else "monitoring"


def upgrade() -> None:
    conn = op.get_bind()

    # --- program grows the fields a condition needs -------------------------
    op.add_column(
        "programs",
        sa.Column("ended_date", sa.Date(), nullable=True),
        schema="wild_life",
    )
    op.add_column(
        "programs", sa.Column("category", sa.Text(), nullable=True), schema="wild_life"
    )
    op.add_column(
        "programs",
        sa.Column(
            "involves",
            sa.ARRAY(sa.Text()),
            server_default="{}",
            nullable=False,
        ),
        schema="wild_life",
    )
    op.add_column(
        "medications",
        sa.Column("program_id", sa.UUID(), nullable=True),
        schema="wild_life",
    )
    op.create_foreign_key(
        "medications_program_id_fkey",
        "medications",
        "programs",
        ["program_id"],
        ["id"],
        source_schema="wild_life",
        referent_schema="wild_life",
        ondelete="SET NULL",
    )
    op.create_index(
        "ix_wild_life_medications_program_id",
        "medications",
        ["program_id"],
        schema="wild_life",
    )

    # No program has ever carried a target date, and the field invites reading a
    # program as a dated effort. `ended_date` takes the slot and does real work.
    conn.execute(
        sa.text(
            "UPDATE wild_life.programs SET ended_date = target_date "
            "WHERE target_date IS NOT NULL"
        )
    )
    for old, new in (("completed", "resolved"),):
        conn.execute(
            sa.text("UPDATE wild_life.programs SET status = :new WHERE status = :old"),
            {"old": old, "new": new},
        )

    # --- each condition becomes a program -----------------------------------
    op.create_table(
        "_condition_program_map",
        sa.Column("condition_id", sa.UUID(), primary_key=True),
        sa.Column("program_id", sa.UUID(), nullable=False),
        schema="wild_life",
    )
    for c in (
        conn.execute(
            sa.text(
                "SELECT id, name, description, status, category, area_id, "
                "onset_date, resolved_date, diagnosed_by_id, notes "
                "FROM wild_life.conditions"
            )
        )
        .mappings()
        .all()
    ):
        new_id = conn.execute(
            sa.text(
                "INSERT INTO wild_life.programs "
                "(name, description, status, category, area_id, start_date, ended_date) "
                "VALUES (:name, :description, :status, :category, :area_id, :start, :end) "
                "RETURNING id"
            ),
            {
                "name": c["name"],
                "description": c["description"],
                "status": _status_for(conn, c),
                "category": c["category"],
                "area_id": c["area_id"],
                "start": c["onset_date"],
                "end": c["resolved_date"],
            },
        ).scalar_one()
        conn.execute(
            sa.text(
                "INSERT INTO wild_life._condition_program_map (condition_id, program_id) "
                "VALUES (:c, :p)"
            ),
            {"c": c["id"], "p": new_id},
        )
        # The one field with no column to land in becomes a rooted note, the way
        # every other scalar `notes` blob already did in b1c2d3e4f5a6.
        if c["notes"]:
            conn.execute(
                sa.text(
                    "INSERT INTO wild_life.notes (body, entity_type, entity_id) "
                    "VALUES (:body, 'program', :pid)"
                ),
                {"body": c["notes"], "pid": new_id},
            )
        # "Diagnosed by" is a typed edge to a person, not a column on every program.
        if c["diagnosed_by_id"]:
            conn.execute(
                sa.text(
                    "INSERT INTO wild_life.entity_links "
                    "(source_type, source_id, target_type, target_id, relation) "
                    "VALUES ('program', :pid, 'person', :person, 'diagnosed_by') "
                    "ON CONFLICT DO NOTHING"
                ),
                {"pid": new_id, "person": c["diagnosed_by_id"]},
            )

    # --- repoint everything that pointed at a condition ---------------------
    for table in ("metrics", "protocols", "medications"):
        conn.execute(
            sa.text(
                f"UPDATE wild_life.{table} t SET program_id = m.program_id "
                f"FROM wild_life._condition_program_map m "
                f"WHERE t.condition_id = m.condition_id"
            )
        )
    # Soft-poly roots. This list is `merge.py:SOFT_POLY` — the same checklist, and
    # the reason it has to be complete: a root left pointing at a dropped table is
    # data you can no longer reach.
    for table, tcol, icol in (
        ("notes", "entity_type", "entity_id"),
        ("note_mentions", "target_type", "target_id"),
        ("entity_tags", "entity_type", "entity_id"),
        ("commitments", "entity_type", "entity_id"),
        ("requests", "entity_type", "entity_id"),
        ("delegations", "entity_type", "entity_id"),
        ("resources", "entity_type", "entity_id"),
        ("decisions", "entity_type", "entity_id"),
        ("events", "entity_type", "entity_id"),
        ("outcomes", "entity_type", "entity_id"),
        ("entity_links", "target_type", "target_id"),
        ("entity_links", "source_type", "source_id"),
    ):
        conn.execute(
            sa.text(
                f"UPDATE wild_life.{table} t SET {tcol} = 'program', {icol} = m.program_id "
                f"FROM wild_life._condition_program_map m "
                f"WHERE t.{tcol} = 'condition' AND t.{icol} = m.condition_id"
            )
        )

    # --- metric gets one root -----------------------------------------------
    op.add_column(
        "metrics",
        sa.Column("entity_type", sa.Text(), nullable=True),
        schema="wild_life",
    )
    op.add_column(
        "metrics", sa.Column("entity_id", sa.UUID(), nullable=True), schema="wild_life"
    )
    # Most specific wins: what a reading is *about* is the program before the area.
    conn.execute(
        sa.text(
            "UPDATE wild_life.metrics SET entity_type = 'program', entity_id = program_id "
            "WHERE program_id IS NOT NULL"
        )
    )
    conn.execute(
        sa.text(
            "UPDATE wild_life.metrics SET entity_type = 'area', entity_id = area_id "
            "WHERE entity_id IS NULL AND area_id IS NOT NULL"
        )
    )
    orphans = conn.execute(
        sa.text("SELECT count(*) FROM wild_life.metrics WHERE entity_id IS NULL")
    ).scalar()
    if orphans:
        raise RuntimeError(
            f"{orphans} metrics have no area, program or condition to root to — "
            "give them one before migrating, or they become unreachable"
        )
    op.alter_column("metrics", "entity_type", nullable=False, schema="wild_life")
    op.alter_column("metrics", "entity_id", nullable=False, schema="wild_life")
    op.create_index(
        "ix_metrics_root", "metrics", ["entity_type", "entity_id"], schema="wild_life"
    )

    # --- involves: seed from what each program actually holds ----------------
    conn.execute(
        sa.text(
            "UPDATE wild_life.programs p SET involves = sub.kinds FROM ("
            "  SELECT p2.id, array_remove(ARRAY["
            "    CASE WHEN EXISTS (SELECT 1 FROM wild_life.medications m WHERE m.program_id = p2.id) THEN 'medication' END,"
            "    CASE WHEN EXISTS (SELECT 1 FROM wild_life.protocols pr WHERE pr.program_id = p2.id) THEN 'protocol' END"
            "  ], NULL) AS kinds FROM wild_life.programs p2"
            ") sub WHERE p.id = sub.id AND array_length(sub.kinds, 1) > 0"
        )
    )


def downgrade() -> None:
    op.drop_index("ix_metrics_root", "metrics", schema="wild_life")
    op.drop_column("metrics", "entity_id", schema="wild_life")
    op.drop_column("metrics", "entity_type", schema="wild_life")
    op.drop_index(
        "ix_wild_life_medications_program_id", "medications", schema="wild_life"
    )
    op.drop_column("medications", "program_id", schema="wild_life")
    op.drop_column("programs", "involves", schema="wild_life")
    op.drop_column("programs", "category", schema="wild_life")
    op.drop_column("programs", "ended_date", schema="wild_life")
    op.drop_table("_condition_program_map", schema="wild_life")
