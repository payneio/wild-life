"""add locations entity and note_mentions join

Revision ID: f1a2b3c4d5e6
Revises: cc12676f0455
Create Date: 2026-07-15
"""

from collections.abc import Sequence

from alembic import op
import sqlalchemy as sa

revision: str = "f1a2b3c4d5e6"
down_revision: str | None = "cc12676f0455"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.create_table(
        "locations",
        sa.Column("name", sa.Text(), nullable=False),
        sa.Column("category", sa.Text(), nullable=True),
        sa.Column("address", sa.Text(), nullable=True),
        sa.Column("city", sa.Text(), nullable=True),
        sa.Column("region", sa.Text(), nullable=True),
        sa.Column("notes", sa.Text(), nullable=True),
        sa.Column(
            "id", sa.UUID(), server_default=sa.text("gen_random_uuid()"), nullable=False
        ),
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
        sa.PrimaryKeyConstraint("id"),
        schema="personal_api",
    )
    op.create_table(
        "note_mentions",
        sa.Column("note_id", sa.UUID(), nullable=False),
        sa.Column("target_type", sa.Text(), nullable=False),
        sa.Column("target_id", sa.UUID(), nullable=False),
        sa.ForeignKeyConstraint(
            ["note_id"],
            ["personal_api.notes.id"],
            name=op.f("fk_personal_api_note_mentions_note_id_notes"),
            ondelete="CASCADE",
        ),
        sa.PrimaryKeyConstraint("note_id", "target_type", "target_id"),
        schema="personal_api",
    )
    op.create_index(
        "ix_note_mentions_target",
        "note_mentions",
        ["target_type", "target_id"],
        unique=False,
        schema="personal_api",
    )


def downgrade() -> None:
    op.drop_index(
        "ix_note_mentions_target", table_name="note_mentions", schema="personal_api"
    )
    op.drop_table("note_mentions", schema="personal_api")
    op.drop_table("locations", schema="personal_api")
