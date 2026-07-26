"""merge person-fields and change-log

Revision ID: 633982151ca4
Revises: 1f2e3d4c5b6a, 689a01c6381a
Create Date: 2026-07-15 08:20:13.319562
"""

from collections.abc import Sequence


revision: str = "633982151ca4"
down_revision: str | None = ("1f2e3d4c5b6a", "689a01c6381a")
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    pass


def downgrade() -> None:
    pass
