"""retire tagging

Tags did one job nothing else could: recall by a theme that isn't an object.
"Everything about grief" is not an area, not an entity you can root to or
mention, and not reliably a word in the text.

That job is better done by search. Full-text already covers the literal case, and
vector search covers the rest without anyone maintaining a vocabulary — which is
the actual cost. Every tag in this database was assigned by the 2026-07-15
import, not by hand, and the only thing in the app that ever read one was a
filter on the people list. A label nobody chose, curated by nobody, read by
nothing.

So the mechanism goes rather than the vocabulary being tidied. 178 tags and 1,230
attachments are recorded here first: this is reversible, and the tags were a
plausible-looking index over 29 years of writing, so "we can get it back" should
be true rather than assumed.

Revision ID: b1c2d3e4f5a7
Revises: a0b1c2d3e4f5
Create Date: 2026-07-27
"""

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op

revision: str = "b1c2d3e4f5a7"
down_revision: str | None = "a0b1c2d3e4f5"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.execute(
        sa.text(
            """
            CREATE TABLE wild_life._retired_tags AS
            SELECT t.id, t.name, t.color FROM wild_life.tags t
            """
        )
    )
    op.execute(
        sa.text(
            """
            CREATE TABLE wild_life._retired_entity_tags AS
            SELECT e.tag_id, e.entity_type, e.entity_id FROM wild_life.entity_tags e
            """
        )
    )
    op.drop_table("entity_tags", schema="wild_life")
    op.drop_table("tags", schema="wild_life")


def downgrade() -> None:
    op.create_table(
        "tags",
        sa.Column(
            "id",
            sa.dialects.postgresql.UUID(as_uuid=True),
            primary_key=True,
            server_default=sa.text("gen_random_uuid()"),
        ),
        sa.Column("name", sa.Text(), nullable=False, unique=True),
        sa.Column("color", sa.Text()),
        schema="wild_life",
    )
    op.create_table(
        "entity_tags",
        sa.Column(
            "tag_id",
            sa.dialects.postgresql.UUID(as_uuid=True),
            sa.ForeignKey("wild_life.tags.id", ondelete="CASCADE"),
            primary_key=True,
        ),
        sa.Column("entity_type", sa.Text(), primary_key=True),
        sa.Column(
            "entity_id", sa.dialects.postgresql.UUID(as_uuid=True), primary_key=True
        ),
        schema="wild_life",
    )
    op.execute(
        sa.text(
            "INSERT INTO wild_life.tags (id, name, color) "
            "SELECT id, name, color FROM wild_life._retired_tags"
        )
    )
    op.execute(
        sa.text(
            "INSERT INTO wild_life.entity_tags (tag_id, entity_type, entity_id) "
            "SELECT tag_id, entity_type, entity_id FROM wild_life._retired_entity_tags"
        )
    )
    op.execute(sa.text("DROP TABLE wild_life._retired_entity_tags"))
    op.execute(sa.text("DROP TABLE wild_life._retired_tags"))
