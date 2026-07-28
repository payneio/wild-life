"""one tagging mechanism: text[] columns fold into Tag + EntityTag

Two systems shared a word. `notes.tags` and `resources.tags` were `text[]`
columns — a tag was a string, with no identity — while `Tag`/`EntityTag` gave
tags a row, a colour and a polymorphic attachment, and were used by exactly one
component (person tags on the People page).

The fold goes toward the join table, for the same reason the `notes` columns went
away in `f9a0b1c2d3e4`: a `tags text[]` column per entity is the per-entity-column
pattern, where every table that wants tags grows its own. `EntityTag` is the
polymorphic edge — the same shape as soft-poly rooting and `note_mentions` — so
one mechanism covers every entity, present and future.

What identity buys, concretely: rename-once (this data holds both `work` at 38
uses and `work:microsoft` at 91, which is exactly the drift a string column
cannot fix), colours, and a `/tags` page that shows the real vocabulary instead
of the five rows that happened to be curated by hand.

1,174 attachments across 179 distinct tags, with no case or whitespace variants
to reconcile — verified before writing this. 5 tags already exist and are reused
rather than duplicated.

Revision ID: a0b1c2d3e4f5
Revises: f9a0b1c2d3e4
Create Date: 2026-07-27
"""

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op

revision: str = "a0b1c2d3e4f5"
down_revision: str | None = "f9a0b1c2d3e4"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None

# (table, EntityType) — the two columns carrying string tags.
SOURCES: list[tuple[str, str]] = [("notes", "note"), ("resources", "resource")]


def upgrade() -> None:
    # Keep the arrays so the downgrade restores exact membership rather than
    # inferring it from EntityTag, which would also sweep up anything tagged by
    # hand since.
    op.execute(
        sa.text(
            """
            CREATE TABLE wild_life._tag_migration_backup (
                source_table text NOT NULL,
                row_id       uuid NOT NULL,
                tags         text[] NOT NULL,
                PRIMARY KEY (source_table, row_id)
            )
            """
        )
    )
    for table, _ in SOURCES:
        op.execute(
            sa.text(
                f"""
                INSERT INTO wild_life._tag_migration_backup (source_table, row_id, tags)
                SELECT '{table}', id, tags FROM wild_life.{table}
                """
            )
        )

    # Every distinct string becomes a Tag, reusing the ones already curated.
    for table, _ in SOURCES:
        op.execute(
            sa.text(
                f"""
                INSERT INTO wild_life.tags (name)
                SELECT DISTINCT btrim(t.tag)
                  FROM wild_life.{table} r, unnest(r.tags) AS t(tag)
                 WHERE btrim(t.tag) <> ''
                ON CONFLICT (name) DO NOTHING
                """
            )
        )

    for table, entity_type in SOURCES:
        op.execute(
            sa.text(
                f"""
                INSERT INTO wild_life.entity_tags (tag_id, entity_type, entity_id)
                SELECT DISTINCT g.id, '{entity_type}', r.id
                  FROM wild_life.{table} r,
                       unnest(r.tags) AS t(tag)
                  JOIN wild_life.tags g ON g.name = btrim(t.tag)
                 WHERE btrim(t.tag) <> ''
                ON CONFLICT DO NOTHING
                """
            )
        )
        op.drop_column(table, "tags", schema="wild_life")


def downgrade() -> None:
    for table, entity_type in SOURCES:
        op.add_column(
            table,
            sa.Column(
                "tags",
                sa.dialects.postgresql.ARRAY(sa.Text()),
                nullable=False,
                server_default="{}",
            ),
            schema="wild_life",
        )
        op.execute(
            sa.text(
                f"""
                UPDATE wild_life.{table} t
                   SET tags = b.tags
                  FROM wild_life._tag_migration_backup b
                 WHERE b.source_table = '{table}' AND b.row_id = t.id
                """
            )
        )
        # Only the attachments this migration made; anything tagged by hand since
        # stays, which is why the arrays were kept rather than reverse-engineered.
        op.execute(
            sa.text(
                f"""
                DELETE FROM wild_life.entity_tags e
                 USING wild_life._tag_migration_backup b, wild_life.tags g
                 WHERE e.entity_type = '{entity_type}'
                   AND b.source_table = '{table}'
                   AND e.entity_id = b.row_id
                   AND e.tag_id = g.id
                   AND g.name = ANY(b.tags)
                """
            )
        )
    # The Tag rows themselves are left behind deliberately. `entity_tags.tag_id`
    # cascades, so deleting a tag this migration created would silently destroy
    # any attachment made by hand against it since. An unused Tag row is inert;
    # a lost attachment is not.
    op.execute(sa.text("DROP TABLE wild_life._tag_migration_backup"))
