"""Retire the pre-inversion tables, and the type names that outlived them.

The inversion finished when every surface began writing the spine inline. What
remained was a second copy of the same facts — `events` and `notes` and their
satellites — written by nothing, read by nothing, and kept warm by a mirror that
has now been deleted. A frozen table is worse than no table, because it answers.

Three things happen here, in order, because each depends on the last:

1. **The one event the mirror never reached becomes a moment.** It was created
   after the last incremental window and no full run followed, so a note about
   an exercise session pointed at a row the app can no longer open. Mapped the
   way the mirror would have: `event_type` in (note, symptom, injury) is an
   `observation`, not an `occasion`.
2. **Every `event`-typed link is repointed at the moment that event became.**
   `event` is a type the inversion retired; a link to one can only 404, and
   `moment` is a legal `entity_type` precisely so this has somewhere to go.
3. **The tables are dropped**, along with the migration scaffolding that has
   been sitting beside the live schema looking identical to it.

The data is not gone: `migrations/legacy/*.csv` holds every row of all ten
tables, verified row-for-row against the database before this was written. The
escape hatch survives as an artifact rather than as live schema, which is the
distinction that matters — an artifact cannot be read by mistake.

Down-migration recreates the tables empty. It cannot bring the rows back, and
says so rather than pretending: restoring them is a `\\copy` from the CSVs.

Revision ID: c4d5e6f7a8b9
Revises: b68e54dddfe5
"""

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op

revision: str = "c4d5e6f7a8b9"
down_revision: str | None = "b68e54dddfe5"
branch_labels: Sequence[str] | None = None
depends_on: Sequence[str] | None = None

_LEGACY = (
    # Children before parents: note_mentions and note_images point at notes.
    "note_mentions",
    "note_images",
    "notes",
    "events",
)

_SCAFFOLDING = (
    "_retired_entity_tags",
    "_tag_migration_backup",
    "_note_migration_backup",
    "_prose_migration_backup",
    "_retired_tags",
    "_work_journal_dates",
)


def upgrade() -> None:
    # 1. The event the mirror missed.
    op.execute("""
        INSERT INTO wild_life.moments
            (kind, started_at, all_day, title, body, source, source_ref)
        SELECT
            CASE WHEN e.event_type IN ('note', 'symptom', 'injury')
                 THEN 'observation' ELSE 'occasion' END,
            e.start_at, e.all_day, e.title, coalesce(e.description, ''), 'authored',
            'event:' || e.id::text
          FROM wild_life.events e
         WHERE EXISTS (
                   SELECT 1 FROM wild_life.moment_links l
                    WHERE l.entity_type = 'event' AND l.entity_id = e.id
               )
           AND NOT EXISTS (
                   SELECT 1 FROM wild_life.moments m
                    WHERE m.source_ref = 'event:' || e.id::text
               )
        ON CONFLICT (source_ref) DO NOTHING
    """)

    # 2. Repoint the links at what those events became.
    op.execute("""
        UPDATE wild_life.moment_links l
           SET entity_type = 'moment', entity_id = m.id
          FROM wild_life.moments m
         WHERE l.entity_type = 'event'
           AND m.source_ref = 'event:' || l.entity_id::text
    """)
    # Any that still cannot be resolved are dropped rather than left pointing at
    # a type that no longer exists. There should be none; this is the assertion
    # that there were none, expressed as a statement that removes nothing.
    op.execute("DELETE FROM wild_life.moment_links WHERE entity_type = 'event'")
    op.execute("DELETE FROM wild_life.moment_links WHERE entity_type = 'note'")

    # 3. The tables themselves.
    for table in _LEGACY + _SCAFFOLDING:
        op.execute(f"DROP TABLE IF EXISTS wild_life.{table} CASCADE")


def downgrade() -> None:
    """Recreate the shells. The rows are in `migrations/legacy/*.csv`.

    Deliberately not a data restore: re-deriving 3,000 rows from a CSV inside a
    migration would be slower and less inspectable than the `\\copy` that does
    it honestly, and a downgrade that silently half-restored would be worse than
    one that admits what it is.
    """
    op.create_table(
        "events",
        sa.Column("id", sa.UUID(), primary_key=True),
        sa.Column("title", sa.Text(), nullable=False),
        sa.Column("description", sa.Text()),
        sa.Column("event_type", sa.Text()),
        sa.Column("start_at", sa.DateTime(timezone=True)),
        sa.Column("end_at", sa.DateTime(timezone=True)),
        sa.Column("all_day", sa.Boolean(), server_default=sa.text("false")),
        sa.Column("created_at", sa.DateTime(timezone=True)),
        sa.Column("updated_at", sa.DateTime(timezone=True)),
        schema="wild_life",
    )
    op.create_table(
        "notes",
        sa.Column("id", sa.UUID(), primary_key=True),
        sa.Column("body", sa.Text(), nullable=False),
        sa.Column("entry_date", sa.Date()),
        sa.Column("entity_type", sa.Text()),
        sa.Column("entity_id", sa.UUID()),
        sa.Column("created_at", sa.DateTime(timezone=True)),
        sa.Column("updated_at", sa.DateTime(timezone=True)),
        schema="wild_life",
    )
    op.create_table(
        "note_mentions",
        sa.Column("id", sa.UUID(), primary_key=True),
        sa.Column("note_id", sa.UUID()),
        sa.Column("entity_type", sa.Text()),
        sa.Column("entity_id", sa.UUID()),
        schema="wild_life",
    )
    op.create_table(
        "note_images",
        sa.Column("id", sa.UUID(), primary_key=True),
        sa.Column("note_id", sa.UUID()),
        sa.Column("created_at", sa.DateTime(timezone=True)),
        schema="wild_life",
    )
