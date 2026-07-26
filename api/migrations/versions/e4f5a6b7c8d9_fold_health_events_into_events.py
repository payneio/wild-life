"""fold health_events into type-faceted events

A HealthEvent is a dated clinical *record* — structurally a typed Event whose
narrative belongs in a note. This adds `event_type` to Event and folds every
health_event into an all-day Event:
  occurred_on   -> start_at (all_day)
  event_type    -> the Event's type facet
  condition_id  -> the event's primary context (entity_type/entity_id); condition-less
                   records fall back to the "Preventative" condition
  provider/org  -> @mentions on a rooted clinical note
  summary/findings/recommendations/follow_up/external_ref -> that note's body

The source `health_events` table is left in place (dormant backup) and dropped in a
later verified migration. Any note_mentions/entity_tags pointing at a health_event are
repointed to the new event.

Revision ID: e4f5a6b7c8d9
Revises: d3e4f5a6b7c8
Create Date: 2026-07-22
"""

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op

revision: str = "e4f5a6b7c8d9"
down_revision: str | None = "d3e4f5a6b7c8"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    conn = op.get_bind()
    op.add_column(
        "events", sa.Column("event_type", sa.Text(), nullable=True), schema="wild_life"
    )

    preventative = conn.execute(
        sa.text(
            "SELECT id FROM wild_life.conditions WHERE name = 'Preventative' LIMIT 1"
        )
    ).scalar()

    hes = (
        conn.execute(
            sa.text(
                """
            SELECT id, occurred_on, event_type, title, provider_id, organization_id,
                   condition_id, summary, findings, recommendations, follow_up,
                   location, external_ref
            FROM wild_life.health_events
            """
            )
        )
        .mappings()
        .all()
    )

    for he in hes:
        ctx = he["condition_id"] or preventative
        event_id = conn.execute(
            sa.text(
                """
                INSERT INTO wild_life.events
                    (id, title, start_at, all_day, event_type, entity_type, entity_id,
                     location, attendees, recurrence_exdates, created_at, updated_at)
                VALUES (gen_random_uuid(), :title, (:occurred_on)::timestamptz, true,
                        :event_type, CASE WHEN :ctx IS NULL THEN NULL ELSE 'condition' END,
                        :ctx, :location, '{}', '{}', now(), now())
                RETURNING id
                """
            ),
            {
                "title": he["title"],
                "occurred_on": str(he["occurred_on"]),
                "event_type": he["event_type"],
                "ctx": ctx,
                "location": he["location"],
            },
        ).scalar_one()

        # Clinical narrative -> a note rooted to the new event.
        parts: list[str] = []
        if he["summary"]:
            parts.append(str(he["summary"]))
        if he["findings"]:
            parts.append(f"## Findings\n{he['findings']}")
        if he["recommendations"]:
            parts.append(f"## Recommendations\n{he['recommendations']}")
        if he["follow_up"]:
            parts.append(f"## Follow-up\n{he['follow_up']}")
        if he["external_ref"]:
            parts.append(f"Record: {he['external_ref']}")

        if parts or he["provider_id"] or he["organization_id"]:
            note_id = conn.execute(
                sa.text(
                    """
                    INSERT INTO wild_life.notes
                        (id, body, note_type, entity_type, entity_id, entry_date,
                         created_at, updated_at)
                    VALUES (gen_random_uuid(), :body, 'note', 'event', :eid, :entry_date,
                            now(), now())
                    RETURNING id
                    """
                ),
                {
                    "body": "\n\n".join(parts),
                    "eid": event_id,
                    "entry_date": he["occurred_on"],
                },
            ).scalar_one()
            for col, ttype in (
                ("provider_id", "person"),
                ("organization_id", "organization"),
            ):
                if he[col]:
                    conn.execute(
                        sa.text(
                            """
                            INSERT INTO wild_life.note_mentions (note_id, target_type, target_id)
                            VALUES (:n, :t, :tid) ON CONFLICT DO NOTHING
                            """
                        ),
                        {"n": note_id, "t": ttype, "tid": he[col]},
                    )

        # Repoint any soft-poly references from the old health_event to the new event.
        for tbl, tcol, icol in (
            ("note_mentions", "target_type", "target_id"),
            ("entity_tags", "entity_type", "entity_id"),
        ):
            conn.execute(
                sa.text(
                    f"UPDATE wild_life.{tbl} SET {tcol}='event', {icol}=:eid "
                    f"WHERE {tcol}='health_event' AND {icol}=:heid"
                ),
                {"eid": event_id, "heid": he["id"]},
            )


def downgrade() -> None:
    # One-way (records were copied, not moved). Just drop the added column.
    op.drop_column("events", "event_type", schema="wild_life")
