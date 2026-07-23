"""event context link — replace area/program/project FKs with entity_type/entity_id

Events get the app's standard soft-polymorphic primary link (entity_type/entity_id,
"what this event is about"), replacing the fixed area/program/project FK triple that
was 99.8% empty. Existing links are folded into the pair by specificity
(project > program > area). Unrooted = entity_type IS NULL, symmetric with notes.

Revision ID: d3e4f5a6b7c8
Revises: c2d3e4f5a6b7
Create Date: 2026-07-22
"""

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op

revision: str = "d3e4f5a6b7c8"
down_revision: str | None = "c2d3e4f5a6b7"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.add_column("events", sa.Column("entity_type", sa.Text(), nullable=True), schema="wild_life")
    op.add_column("events", sa.Column("entity_id", sa.UUID(), nullable=True), schema="wild_life")

    # Fold the old FK triple into the polymorphic pair, most specific wins.
    op.execute(
        sa.text(
            """
            UPDATE wild_life.events SET entity_type='project', entity_id=project_id
              WHERE project_id IS NOT NULL;
            UPDATE wild_life.events SET entity_type='program', entity_id=program_id
              WHERE program_id IS NOT NULL AND entity_id IS NULL;
            UPDATE wild_life.events SET entity_type='area', entity_id=area_id
              WHERE area_id IS NOT NULL AND entity_id IS NULL;
            """
        )
    )

    op.create_index("ix_events_entity_id", "events", ["entity_id"], schema="wild_life")
    op.drop_column("events", "project_id", schema="wild_life")
    op.drop_column("events", "program_id", schema="wild_life")
    op.drop_column("events", "area_id", schema="wild_life")


def downgrade() -> None:
    op.add_column("events", sa.Column("area_id", sa.UUID(), nullable=True), schema="wild_life")
    op.add_column("events", sa.Column("program_id", sa.UUID(), nullable=True), schema="wild_life")
    op.add_column("events", sa.Column("project_id", sa.UUID(), nullable=True), schema="wild_life")
    op.execute(
        sa.text(
            """
            UPDATE wild_life.events SET area_id=entity_id    WHERE entity_type='area';
            UPDATE wild_life.events SET program_id=entity_id WHERE entity_type='program';
            UPDATE wild_life.events SET project_id=entity_id WHERE entity_type='project';
            """
        )
    )
    op.drop_index("ix_events_entity_id", table_name="events", schema="wild_life")
    op.drop_column("events", "entity_id", schema="wild_life")
    op.drop_column("events", "entity_type", schema="wild_life")
