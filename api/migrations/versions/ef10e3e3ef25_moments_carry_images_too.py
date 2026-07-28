"""moments carry images too

Notes can hold attached pictures — 13 of them across 7 entries — and a spine that
could not would be a smaller app than the one that exists. Same shape as
`note_images`, one directory over on disk, referenced inline as
`![alt](moment-image:<id>)`.


Revision ID: ef10e3e3ef25
Revises: 23db59a2c1e0
Create Date: 2026-07-28 13:11:00.123742
"""

from collections.abc import Sequence

from alembic import op
import sqlalchemy as sa


revision: str = "ef10e3e3ef25"
down_revision: str | None = "23db59a2c1e0"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.create_table(
        "moment_images",
        sa.Column("moment_id", sa.UUID(), nullable=False),
        sa.Column("filename", sa.Text(), nullable=True),
        sa.Column("content_type", sa.Text(), nullable=True),
        sa.Column("sort_order", sa.Integer(), server_default="0", nullable=False),
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
        sa.ForeignKeyConstraint(
            ["moment_id"], ["wild_life.moments.id"], ondelete="CASCADE"
        ),
        sa.PrimaryKeyConstraint("id"),
        schema="wild_life",
    )
    op.create_index(
        "ix_moment_images_moment",
        "moment_images",
        ["moment_id"],
        unique=False,
        schema="wild_life",
    )


def downgrade() -> None:
    op.drop_index(
        "ix_moment_images_moment", table_name="moment_images", schema="wild_life"
    )
    op.drop_table("moment_images", schema="wild_life")
