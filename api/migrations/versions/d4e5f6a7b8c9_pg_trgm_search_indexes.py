"""pg_trgm extension + GIN trigram indexes for fast ILIKE search

Revision ID: d4e5f6a7b8c9
Revises: a199c43d41cf
Create Date: 2026-07-15
"""

from collections.abc import Sequence

from alembic import op

revision: str = "d4e5f6a7b8c9"
down_revision: str | None = "a199c43d41cf"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.execute("CREATE EXTENSION IF NOT EXISTS pg_trgm")
    # GIN trigram indexes accelerate the `q=`/`__contains` ILIKE '%x%' scans on
    # the largest text — note bodies/titles (the journal search hot path).
    op.create_index(
        "ix_notes_body_trgm",
        "notes",
        ["body"],
        schema="wild_life",
        postgresql_using="gin",
        postgresql_ops={"body": "gin_trgm_ops"},
    )
    op.create_index(
        "ix_notes_title_trgm",
        "notes",
        ["title"],
        schema="wild_life",
        postgresql_using="gin",
        postgresql_ops={"title": "gin_trgm_ops"},
    )


def downgrade() -> None:
    op.drop_index("ix_notes_title_trgm", table_name="notes", schema="wild_life")
    op.drop_index("ix_notes_body_trgm", table_name="notes", schema="wild_life")
    # leave the pg_trgm extension in place (may be used elsewhere)
