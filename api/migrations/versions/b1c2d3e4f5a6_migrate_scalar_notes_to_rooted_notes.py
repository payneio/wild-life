"""migrate scalar notes to rooted notes

Copies each non-empty scalar `notes` text column into a first-class, rooted
`Note` row (entity_type/entity_id = the source row). This makes notes the single
commentary layer; the scalar columns are dropped in a later migration once the
copy is verified in the app.

Only workspace/work-item tables that (a) have a scalar `notes` column and (b) map
to a valid EntityType are migrated. Leaf tables (metrics, medications, routines,
…) keep their scalar `notes` as a lightweight aside and are intentionally left
alone; `decisions`/`tags` have no scalar `notes` column.

Revision ID: b1c2d3e4f5a6
Revises: 17c55ff740f0
Create Date: 2026-07-22
"""

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op

revision: str = "b1c2d3e4f5a6"
down_revision: str | None = "17c55ff740f0"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None

# (source table, entity_type literal) — one rooted note per non-empty scalar note.
_TABLES: list[tuple[str, str]] = [
    ("areas", "area"),
    ("programs", "program"),
    ("projects", "project"),
    ("goals", "goal"),
    ("tasks", "task"),
    ("events", "event"),
    ("people", "person"),
    ("commitments", "commitment"),
    ("delegations", "delegation"),
    ("requests", "request"),
    ("reviews", "review"),
]


def upgrade() -> None:
    for table, entity_type in _TABLES:
        # entry_date := created_at::date so the migrated note lands on the right
        # day in the Journal timeline. body := the scalar notes text (guarded
        # non-empty because Note.body is NOT NULL).
        op.execute(
            sa.text(
                f"""
                INSERT INTO wild_life.notes
                    (id, body, note_type, entity_type, entity_id,
                     entry_date, created_at, updated_at)
                SELECT gen_random_uuid(), notes, 'note', '{entity_type}', id,
                       created_at::date, created_at, now()
                FROM wild_life.{table}
                WHERE notes IS NOT NULL AND notes <> ''
                """
            )
        )


def downgrade() -> None:
    # Intentionally one-way: migrated rows are indistinguishable from notes the
    # user later created against the same entities, so there is no safe automatic
    # delete. Restore from backup if you must reverse the copy.
    pass
