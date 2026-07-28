"""rooting becomes universal: journal is the self person's log, note_type retires

Every note now has a subject. `entity_type IS NULL` consequently means exactly one
thing — captured without saying what it is about — which is what the inbox was
always supposed to mean and never did.

Three moves:

1. The 254 unrooted `journal` notes are rooted to the self Person. A journal entry
   is "my observations about myself", the same relation a note on another person
   has to that person; the self is a subject like any other. The 76 journal notes
   already rooted elsewhere stay where they are — their subject was never the
   writer.
2. The 5 `scratch` notes are concatenated into the whiteboard, which stops being a
   collection of notes and becomes what it was always meant to be: one buffer to
   mess around in, outside the entity model.
3. `note_type` is dropped. Every distinction it carried is now the root —
   `journal` → the self person, `meeting` → the event, `note` → the thing,
   `reference` → just a note — and documents are not stored in this app at all.

Reversibility is the point here, not a formality: this drops a column and deletes
rows from a database holding 29 years of writing. `_note_migration_backup` records
every note's `note_type`, whether it was unrooted, and the full row of anything
deleted, so `downgrade()` restores the exact prior state rather than inferring it.
Inference would be wrong: "un-root everything rooted to the self person" would also
catch notes legitimately written about Paul since. The backup table is small (844
narrow rows) and can be dropped by hand once this is settled.

Revision ID: e8f9a0b1c2d3
Revises: d7e8f9a0b1c2
Create Date: 2026-07-27
"""

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op

revision: str = "e8f9a0b1c2d3"
down_revision: str | None = "d7e8f9a0b1c2"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None

# Paul Payne — the Person the owner credential acts as (WILD_LIFE_SELF_PERSON_ID).
# Hardcoded rather than read from settings so the migration is deterministic and
# replays identically on any copy of this database.
SELF_PERSON_ID = "0b085c55-5431-4cd4-89d1-af1bf1b5e817"


def upgrade() -> None:
    op.create_table(
        "whiteboard",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("content", sa.Text(), nullable=False, server_default=""),
        sa.Column(
            "updated_at",
            sa.DateTime(timezone=True),
            nullable=False,
            server_default=sa.text("now()"),
        ),
        sa.CheckConstraint("id = 1", name="ck_whiteboard_single_row"),
        schema="wild_life",
    )

    op.execute(
        sa.text(
            """
            CREATE TABLE wild_life._note_migration_backup (
                note_id      uuid PRIMARY KEY,
                note_type    text NOT NULL,
                was_unrooted boolean NOT NULL,
                deleted_row  jsonb
            )
            """
        )
    )
    op.execute(
        sa.text(
            """
            INSERT INTO wild_life._note_migration_backup
                (note_id, note_type, was_unrooted, deleted_row)
            SELECT n.id,
                   n.note_type,
                   n.entity_type IS NULL,
                   CASE WHEN n.note_type = 'scratch' THEN to_jsonb(n) END
              FROM wild_life.notes n
            """
        )
    )

    # 1. The journal becomes the self person's log.
    op.execute(
        sa.text(
            """
            UPDATE wild_life.notes
               SET entity_type = 'person', entity_id = CAST(:self_id AS uuid)
             WHERE note_type = 'journal' AND entity_type IS NULL
            """
        ).bindparams(self_id=SELF_PERSON_ID)
    )

    # 2. The scratch notes become the one buffer. Oldest first, titles as headings,
    #    so nothing is lost and the order reads the way it was written.
    op.execute(
        sa.text(
            """
            INSERT INTO wild_life.whiteboard (id, content)
            SELECT 1, coalesce(string_agg(chunk, E'\\n\\n' ORDER BY ord), '')
              FROM (
                SELECT row_number() OVER (
                         ORDER BY entry_date NULLS LAST, created_at
                       ) AS ord,
                       CASE WHEN title IS NULL OR title = ''
                            THEN body
                            ELSE '## ' || title || E'\\n\\n' || body
                       END AS chunk
                  FROM wild_life.notes
                 WHERE note_type = 'scratch'
              ) s
            ON CONFLICT (id) DO UPDATE SET content = excluded.content
            """
        )
    )
    op.execute(sa.text("DELETE FROM wild_life.notes WHERE note_type = 'scratch'"))

    # 3. Genre retires.
    op.drop_column("notes", "note_type", schema="wild_life")


def downgrade() -> None:
    op.add_column(
        "notes",
        sa.Column("note_type", sa.Text(), nullable=False, server_default="note"),
        schema="wild_life",
    )
    op.execute(
        sa.text(
            """
            UPDATE wild_life.notes n
               SET note_type = b.note_type
              FROM wild_life._note_migration_backup b
             WHERE n.id = b.note_id
            """
        )
    )
    # Restore the deleted scratch rows before un-rooting, so the un-root pass sees
    # every id the backup names.
    op.execute(
        sa.text(
            """
            INSERT INTO wild_life.notes
            SELECT (jsonb_populate_record(NULL::wild_life.notes, b.deleted_row)).*
              FROM wild_life._note_migration_backup b
             WHERE b.deleted_row IS NOT NULL
            ON CONFLICT (id) DO NOTHING
            """
        )
    )
    op.execute(
        sa.text(
            """
            UPDATE wild_life.notes n
               SET entity_type = NULL, entity_id = NULL
              FROM wild_life._note_migration_backup b
             WHERE n.id = b.note_id AND b.was_unrooted
            """
        )
    )
    op.execute(sa.text("DROP TABLE wild_life._note_migration_backup"))
    op.drop_table("whiteboard", schema="wild_life")
