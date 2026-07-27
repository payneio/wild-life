"""Project's one parent is a program; drop the cached area_id.

Every project that carried both agreed with its program's area in all 25 rows,
so `projects.area_id` only ever restated the program. The 11 that carried an
area and no program were one area's pre-reorg residue — ten archived, one
proposed — which this backfills into a holding program before the column can be
made mandatory.

Revision ID: a4b5c6d7e8f9
Revises: f3a4b5c6d7e8
"""

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op

revision: str = "a4b5c6d7e8f9"
down_revision: str | None = "f3a4b5c6d7e8"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None

SCHEMA = "wild_life"

# The area whose orphans get a named home, and what to call it. Anything else
# that turns up unparented lands in a generic holding program rather than
# blocking the migration — there are no such rows today, but a migration that
# dies on data it did not anticipate is worse than one that files it plainly.
NAMED_ORPHAN_AREA = "MADE: Exploration"
NAMED_ORPHAN_PROGRAM = "Exploration"
FALLBACK_ORPHAN_PROGRAM = "Unfiled"


def upgrade() -> None:
    conn = op.get_bind()

    # A project with neither parent has nowhere to go and would fail the NOT
    # NULL below with an opaque error. There are none; say so if that changes.
    stranded = conn.execute(
        sa.text(
            f"SELECT count(*) FROM {SCHEMA}.projects "
            "WHERE program_id IS NULL AND area_id IS NULL"
        )
    ).scalar_one()
    if stranded:
        raise RuntimeError(
            f"{stranded} project(s) have neither a program nor an area; "
            "give them one before upgrading."
        )

    # One holding program per area that still has program-less projects. The
    # status is `resolved` rather than `archived` — ProgramStatus has no
    # `archived`, and a line of exploration that has run its course is resolved.
    conn.execute(
        sa.text(f"""
        INSERT INTO {SCHEMA}.programs (id, name, area_id, status, description)
        SELECT
            gen_random_uuid(),
            CASE WHEN a.name = :named_area THEN :named_program
                 ELSE :fallback_program END,
            a.id,
            'resolved',
            'Holds projects that predate this area''s programs.'
        FROM {SCHEMA}.areas a
        WHERE EXISTS (
            SELECT 1 FROM {SCHEMA}.projects p
            WHERE p.area_id = a.id AND p.program_id IS NULL
        )
        """),
        {
            "named_area": NAMED_ORPHAN_AREA,
            "named_program": NAMED_ORPHAN_PROGRAM,
            "fallback_program": FALLBACK_ORPHAN_PROGRAM,
        },
    )
    conn.execute(
        sa.text(f"""
        UPDATE {SCHEMA}.projects p
        SET program_id = g.id
        FROM {SCHEMA}.programs g
        WHERE p.program_id IS NULL
          AND g.area_id = p.area_id
          AND g.name IN (:named_program, :fallback_program)
          AND g.description = 'Holds projects that predate this area''s programs.'
        """),
        {
            "named_program": NAMED_ORPHAN_PROGRAM,
            "fallback_program": FALLBACK_ORPHAN_PROGRAM,
        },
    )

    # The cached column goes before the constraint lands, so nothing can be
    # written through it in between. Its index and FK go with it.
    op.drop_column("projects", "area_id", schema=SCHEMA)

    op.alter_column("projects", "program_id", nullable=False, schema=SCHEMA)
    # SET NULL is not available to a non-null column, and a program holding
    # projects should refuse to vanish rather than take them with it.
    op.drop_constraint(
        "projects_program_id_fkey", "projects", schema=SCHEMA, type_="foreignkey"
    )
    op.create_foreign_key(
        "projects_program_id_fkey",
        "projects",
        "programs",
        ["program_id"],
        ["id"],
        source_schema=SCHEMA,
        referent_schema=SCHEMA,
        ondelete="RESTRICT",
    )


def downgrade() -> None:
    op.drop_constraint(
        "projects_program_id_fkey", "projects", schema=SCHEMA, type_="foreignkey"
    )
    op.create_foreign_key(
        "projects_program_id_fkey",
        "projects",
        "programs",
        ["program_id"],
        ["id"],
        source_schema=SCHEMA,
        referent_schema=SCHEMA,
        ondelete="SET NULL",
    )
    op.alter_column("projects", "program_id", nullable=True, schema=SCHEMA)
    op.add_column(
        "projects",
        sa.Column("area_id", sa.UUID(), nullable=True),
        schema=SCHEMA,
    )
    op.create_foreign_key(
        "projects_area_id_fkey",
        "projects",
        "areas",
        ["area_id"],
        ["id"],
        source_schema=SCHEMA,
        referent_schema=SCHEMA,
        ondelete="SET NULL",
    )
    op.create_index(
        "ix_wild_life_projects_area_id", "projects", ["area_id"], schema=SCHEMA
    )
    # Refill the cache from the program — which is where it came from, and the
    # only reason the column could be dropped without losing anything.
    op.execute(
        sa.text(f"""
        UPDATE {SCHEMA}.projects p
        SET area_id = g.area_id
        FROM {SCHEMA}.programs g
        WHERE g.id = p.program_id
        """)
    )
    # The holding programs stay. Deleting them would strand the projects they
    # now hold, and their names say plainly what they are.
