"""let an event point at a Location, without giving up the iCalendar string

`events.location` has always been free text, because that is what iCalendar
carries: inbound invites arrive with strings we cannot always resolve to a place
we know, and outbound ones have to send something. So this adds a reference
*beside* the text rather than replacing it.

The two mean different things and both are worth keeping. `location` is the wire
format. `location_id` is the considered answer — and note it is *planned* rather
than observed, which is exactly why an event needs it when a note does not: a
note's place can be derived from where you happened to be at its timestamp, but
where a meeting is *supposed* to happen cannot.

No backfill. Matching existing free text to locations by name is precisely the
fuzzy guess that would quietly file a meeting at the wrong place, and a wrong
link is worse than no link.

Revision ID: e2f3a4b5c6d7
Revises: d1e2f3a4b5c6
Create Date: 2026-07-27
"""

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects import postgresql

revision: str = "e2f3a4b5c6d7"
down_revision: str | None = "d1e2f3a4b5c6"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.add_column(
        "events",
        sa.Column("location_id", postgresql.UUID(as_uuid=True), nullable=True),
        schema="wild_life",
    )
    # SET NULL rather than CASCADE: deleting a place must not delete the meetings
    # that happened there.
    op.create_foreign_key(
        "fk_events_location_id",
        "events",
        "locations",
        ["location_id"],
        ["id"],
        source_schema="wild_life",
        referent_schema="wild_life",
        ondelete="SET NULL",
    )
    op.create_index(
        "ix_wild_life_events_location_id",
        "events",
        ["location_id"],
        schema="wild_life",
    )


def downgrade() -> None:
    op.drop_index("ix_wild_life_events_location_id", "events", schema="wild_life")
    op.drop_constraint("fk_events_location_id", "events", schema="wild_life")
    op.drop_column("events", "location_id", schema="wild_life")
