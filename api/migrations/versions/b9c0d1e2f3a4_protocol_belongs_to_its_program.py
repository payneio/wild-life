"""a protocol belongs to its program, and only to that

A protocol is grouped routines aimed at an outcome — the recurring counterpart to
a project — so any program can have one, not just a clinical one. It carried both
`area_id` and `program_id`, and every row had both with none carrying an area
without a program: the area only ever restated what the program already said.

Revision ID: b9c0d1e2f3a4
Revises: a8b9c0d1e2f3
Create Date: 2026-07-26
"""

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op

revision: str = "b9c0d1e2f3a4"
down_revision: str | None = "a8b9c0d1e2f3"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    conn = op.get_bind()
    # A protocol filed under an area but no program would lose its home. None
    # exist, but the drop should say so rather than assume it.
    stranded = conn.execute(
        sa.text(
            "SELECT count(*) FROM wild_life.protocols "
            "WHERE area_id IS NOT NULL AND program_id IS NULL"
        )
    ).scalar()
    if stranded:
        raise RuntimeError(
            f"{stranded} protocols have an area but no program — give them one "
            "before dropping the column, or their home is lost"
        )
    op.drop_column("protocols", "area_id", schema="wild_life")


def downgrade() -> None:
    op.add_column(
        "protocols", sa.Column("area_id", sa.UUID(), nullable=True), schema="wild_life"
    )
    # Restore it the only way it was ever true: from the program.
    op.get_bind().execute(
        sa.text(
            "UPDATE wild_life.protocols t SET area_id = p.area_id "
            "FROM wild_life.programs p WHERE t.program_id = p.id"
        )
    )
