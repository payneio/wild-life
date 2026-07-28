"""prose fields say what they hold: no column named `notes`, one `purpose`

A field named `notes` answers no question, so it accumulates whatever has nowhere
else to go — which is how `medications.notes` came to hold four hand-dated events
("Insurance denied 2026-02-02; ordered 42x550mg…") alongside one standing
contingency. Typing a date into a text box is the tell that the box wanted to be a
log.

Three moves:

1. **Every `notes` column is renamed for the question it answers**, or retired.
   The medication rows split on that diagnostic exactly: the four containing a
   date become notes rooted to the medication, dated from the prose; the one that
   does not ("Could switch to magnesium oxide if needed") is a standing
   adjustment and stays a field.
2. **`description` and `intended_outcome` merge into `purpose`.** For a stewarded
   object, what it is and what it is for are one statement. Where both are
   populated they are concatenated rather than chosen between — five programs
   carry genuinely different text in the two and lose nothing here.
3. **`Interaction` and `tasks.context` are deleted.** An Interaction is a dated
   prose record about a person — a Note, minus mentions, tags, images and search,
   in a table whose name collides with drug interactions. `tasks.context` held
   three GTD tags (`@calls`, `@writing`) in a column rendered as prose.

`_prose_migration_backup` records every value this drops or merges so `downgrade`
restores rather than infers. Renames are their own inverse and are not recorded.

Revision ID: f9a0b1c2d3e4
Revises: e8f9a0b1c2d3
Create Date: 2026-07-27
"""

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op

revision: str = "f9a0b1c2d3e4"
down_revision: str | None = "e8f9a0b1c2d3"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None

# (table, old name, new name) — a rename is a lossless, self-inverting fix for a
# column that held the right content under a name that asked nothing.
RENAMES: list[tuple[str, str, str]] = [
    ("metrics", "notes", "scale"),  # "1 = none · 2 = incomplete, straining…"
    ("protocols", "notes", "adjustments"),  # "If plateaued, add oregano oil…"
    ("routines", "notes", "rationale"),  # "Brain-gut (Bauman): reset toward…"
    ("medications", "notes", "adjustments"),  # after the dated rows are lifted out
    ("locations", "notes", "description"),  # "Bar in Orlando; may no longer exist."
    # Why a reading or a dose looked the way it did. Both are empty today and
    # neither is exposed; naming them is what makes surfacing them obvious.
    ("metric_entries", "notes", "context"),
    ("routine_instances", "notes", "context"),
    ("protocols", "intended_outcome", "purpose"),
]

_DATE_IN_PROSE = r"\d{4}-\d{2}-\d{2}"


def _backup(cols: list[tuple[str, str]]) -> None:
    """Record (table, id, column, value) for every row of every column we are
    about to drop or fold, so the downgrade restores exact text.

    Nulls are recorded too, and that is the point: 31 projects have a null
    `description` that the merge fills from `intended_outcome`. Backing up only
    non-null values would leave nothing to restore them *to*, and the downgrade
    would silently keep the merged text — which is how a reversible migration
    quietly stops being one.
    """
    for table, column in cols:
        op.execute(
            sa.text(
                f"""
                INSERT INTO wild_life._prose_migration_backup
                     (source_table, row_id, column_name, value)
                SELECT '{table}', id, '{column}', {column}
                  FROM wild_life.{table}
                """
            )
        )


def upgrade() -> None:
    op.execute(
        sa.text(
            """
            CREATE TABLE wild_life._prose_migration_backup (
                source_table text NOT NULL,
                row_id       uuid NOT NULL,
                column_name  text NOT NULL,
                value        text,
                deleted_row  jsonb,
                PRIMARY KEY (source_table, row_id, column_name)
            )
            """
        )
    )
    _backup(
        [
            ("medications", "notes"),
            ("allergies", "notes"),
            ("insurance_plans", "notes"),
            ("organizations", "notes"),
            ("organizations", "description"),
            ("areas", "description"),
            ("areas", "intended_outcome"),
            ("programs", "description"),
            ("programs", "intended_outcome"),
            ("projects", "description"),
            ("projects", "intended_outcome"),
            ("tasks", "context"),
        ]
    )

    # --- 1. medications: dated lines are a log, the rest is a property ---------
    op.execute(
        sa.text(
            f"""
            INSERT INTO wild_life.notes (title, body, entry_date, entity_type, entity_id)
            SELECT NULL,
                   m.notes,
                   (substring(m.notes FROM '{_DATE_IN_PROSE}'))::date,
                   'medication',
                   m.id
              FROM wild_life.medications m
             WHERE m.notes ~ '{_DATE_IN_PROSE}'
            """
        )
    )
    op.execute(
        sa.text(
            f"UPDATE wild_life.medications SET notes = NULL WHERE notes ~ '{_DATE_IN_PROSE}'"
        )
    )

    # --- 2. allergies: the prose *is* the reaction, which was empty ------------
    op.execute(
        sa.text(
            "UPDATE wild_life.allergies SET reaction = coalesce(reaction, notes) "
            "WHERE notes IS NOT NULL"
        )
    )
    op.drop_column("allergies", "notes", schema="wild_life")

    # --- 3. insurance: the note restated member_id ----------------------------
    op.drop_column("insurance_plans", "notes", schema="wild_life")

    # --- 4. organizations: description wins; 10 rows held identical text -------
    op.execute(
        sa.text(
            "UPDATE wild_life.organizations SET description = coalesce(description, notes)"
        )
    )
    op.drop_column("organizations", "notes", schema="wild_life")

    # --- 5. one `purpose` per stewarded object --------------------------------
    # Concatenated where both are set, so nothing is chosen away.
    for table in ("areas", "programs", "projects"):
        op.execute(
            sa.text(
                f"""
                UPDATE wild_life.{table}
                   SET description = CASE
                         WHEN description IS NULL THEN intended_outcome
                         WHEN intended_outcome IS NULL THEN description
                         WHEN description = intended_outcome THEN description
                         ELSE description || E'\\n\\n' || intended_outcome
                       END
                """
            )
        )
        op.drop_column(table, "intended_outcome", schema="wild_life")
        op.alter_column(
            table, "description", new_column_name="purpose", schema="wild_life"
        )

    # --- 6. renames -----------------------------------------------------------
    for table, old, new in RENAMES:
        op.alter_column(table, old, new_column_name=new, schema="wild_life")

    # --- 7. the second log table, and a tag rendered as prose -----------------
    op.execute(
        sa.text(
            """
            INSERT INTO wild_life.notes (title, body, entry_date, entity_type, entity_id)
            SELECT initcap(i.kind), i.summary, (i.occurred_at AT TIME ZONE 'UTC')::date,
                   'person', i.person_id
              FROM wild_life.interactions i
             WHERE i.summary IS NOT NULL AND i.summary <> ''
            """
        )
    )
    # Keep the whole row, not just its prose: the downgrade has to put the
    # touchpoint back, and a recreated empty table is not a restored one.
    op.execute(
        sa.text(
            """
            INSERT INTO wild_life._prose_migration_backup
                 (source_table, row_id, column_name, deleted_row)
            SELECT 'interactions', i.id, '*', to_jsonb(i) FROM wild_life.interactions i
            """
        )
    )
    op.drop_table("interactions", schema="wild_life")
    op.drop_column("tasks", "context", schema="wild_life")


def downgrade() -> None:
    for table, old, new in reversed(RENAMES):
        op.alter_column(table, new, new_column_name=old, schema="wild_life")

    for table in ("areas", "programs", "projects"):
        op.alter_column(
            table, "purpose", new_column_name="description", schema="wild_life"
        )
        op.add_column(
            table, sa.Column("intended_outcome", sa.Text()), schema="wild_life"
        )

    op.add_column("organizations", sa.Column("notes", sa.Text()), schema="wild_life")
    op.add_column("insurance_plans", sa.Column("notes", sa.Text()), schema="wild_life")
    op.add_column("allergies", sa.Column("notes", sa.Text()), schema="wild_life")
    op.add_column("tasks", sa.Column("context", sa.Text()), schema="wild_life")

    for table, column in [
        ("medications", "notes"),
        ("allergies", "notes"),
        ("insurance_plans", "notes"),
        ("organizations", "notes"),
        ("organizations", "description"),
        ("areas", "description"),
        ("areas", "intended_outcome"),
        ("programs", "description"),
        ("programs", "intended_outcome"),
        ("projects", "description"),
        ("projects", "intended_outcome"),
        ("tasks", "context"),
    ]:
        op.execute(
            sa.text(
                f"""
                UPDATE wild_life.{table} t
                   SET {column} = b.value
                  FROM wild_life._prose_migration_backup b
                 WHERE b.source_table = '{table}'
                   AND b.column_name = '{column}'
                   AND b.row_id = t.id
                """
            )
        )

    # The allergy reaction was empty before the fold; restoring the backup above
    # does not undo that write, so clear what we put there.
    op.execute(
        sa.text(
            """
            UPDATE wild_life.allergies a
               SET reaction = NULL
              FROM wild_life._prose_migration_backup b
             WHERE b.source_table = 'allergies' AND b.column_name = 'notes'
               AND b.row_id = a.id AND a.reaction = b.value
            """
        )
    )

    op.create_table(
        "interactions",
        sa.Column(
            "id",
            sa.dialects.postgresql.UUID(as_uuid=True),
            primary_key=True,
            server_default=sa.text("gen_random_uuid()"),
        ),
        sa.Column(
            "person_id",
            sa.dialects.postgresql.UUID(as_uuid=True),
            sa.ForeignKey("wild_life.people.id", ondelete="CASCADE"),
            nullable=False,
            index=True,
        ),
        sa.Column("occurred_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("kind", sa.Text(), nullable=False),
        sa.Column("summary", sa.Text()),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            nullable=False,
            server_default=sa.text("now()"),
        ),
        sa.Column(
            "updated_at",
            sa.DateTime(timezone=True),
            nullable=False,
            server_default=sa.text("now()"),
        ),
        schema="wild_life",
    )
    op.execute(
        sa.text(
            """
            INSERT INTO wild_life.interactions
            SELECT (jsonb_populate_record(NULL::wild_life.interactions, b.deleted_row)).*
              FROM wild_life._prose_migration_backup b
             WHERE b.source_table = 'interactions'
            """
        )
    )
    # The notes minted from interactions are left in place: they are copies, and
    # deleting notes on the way back would risk taking edits with them.
    op.execute(sa.text("DROP TABLE wild_life._prose_migration_backup"))
