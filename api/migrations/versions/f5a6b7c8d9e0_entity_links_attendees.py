"""entity_links table + backfill event attendee → person links

Adds the generic soft-poly link graph and backfills attendee links for every
existing event (matching attendee emails to People by any email on their card).

Revision ID: f5a6b7c8d9e0
Revises: e4f5a6b7c8d9
Create Date: 2026-07-22
"""

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op

revision: str = "f5a6b7c8d9e0"
down_revision: str | None = "e4f5a6b7c8d9"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.create_table(
        "entity_links",
        sa.Column("source_type", sa.Text(), nullable=False),
        sa.Column("source_id", sa.UUID(), nullable=False),
        sa.Column("target_type", sa.Text(), nullable=False),
        sa.Column("target_id", sa.UUID(), nullable=False),
        sa.Column("relation", sa.Text(), server_default="related", nullable=False),
        sa.PrimaryKeyConstraint(
            "source_type", "source_id", "target_type", "target_id", "relation"
        ),
        schema="wild_life",
    )
    op.create_index(
        "ix_entity_links_target",
        "entity_links",
        ["target_type", "target_id"],
        schema="wild_life",
    )

    # Backfill: email -> person map, then link each event's matched attendees.
    conn = op.get_bind()
    email_to_person: dict[str, object] = {}
    for p in conn.execute(sa.text("SELECT id, emails FROM wild_life.people")).mappings():
        for e in p["emails"] or []:
            v = (e.get("value") or "").strip().lower()
            if v:
                email_to_person.setdefault(v, p["id"])

    events = conn.execute(
        sa.text(
            "SELECT id, attendees FROM wild_life.events "
            "WHERE attendees IS NOT NULL AND cardinality(attendees) > 0"
        )
    ).mappings()
    for ev in events:
        seen: set[object] = set()
        for att in ev["attendees"] or []:
            pid = email_to_person.get((att or "").strip().lower())
            if pid and pid not in seen:
                seen.add(pid)
                conn.execute(
                    sa.text(
                        "INSERT INTO wild_life.entity_links "
                        "(source_type, source_id, target_type, target_id, relation) "
                        "VALUES ('event', :sid, 'person', :tid, 'attendee') "
                        "ON CONFLICT DO NOTHING"
                    ),
                    {"sid": ev["id"], "tid": pid},
                )


def downgrade() -> None:
    op.drop_index("ix_entity_links_target", table_name="entity_links", schema="wild_life")
    op.drop_table("entity_links", schema="wild_life")
