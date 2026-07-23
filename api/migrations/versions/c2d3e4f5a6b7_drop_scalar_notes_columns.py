"""drop scalar notes columns on migrated entities

Removes the now-dormant scalar `notes` text column from the 11 workspace/work-item
tables whose content was copied into first-class rooted notes by b1c2d3e4f5a6.
Leaf tables (metrics, locations, medications, routines, organizations, …) keep
their scalar `notes` as a lightweight aside.

Run only after confirming the copy in the app. Downgrade re-adds the (empty)
columns; the copied text is not moved back.

Revision ID: c2d3e4f5a6b7
Revises: b1c2d3e4f5a6
Create Date: 2026-07-22
"""

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op

revision: str = "c2d3e4f5a6b7"
down_revision: str | None = "b1c2d3e4f5a6"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None

_TABLES: list[str] = [
    "areas",
    "programs",
    "projects",
    "goals",
    "tasks",
    "events",
    "people",
    "commitments",
    "delegations",
    "requests",
    "reviews",
]


def upgrade() -> None:
    for table in _TABLES:
        op.drop_column(table, "notes", schema="wild_life")


def downgrade() -> None:
    for table in _TABLES:
        op.add_column(
            table,
            sa.Column("notes", sa.Text(), nullable=True),
            schema="wild_life",
        )
