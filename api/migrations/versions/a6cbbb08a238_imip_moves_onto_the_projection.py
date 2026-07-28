"""imip moves onto the projection

The last thing still reading `events`. iMIP is *entirely* about the shared
projection — UID, ORGANIZER, SEQUENCE, ATTENDEE, the RSVP pair — which is what
`calendar_records` was built to hold. Three columns were still on the event:

- ``location`` — iCalendar's LOCATION line, a string, and therefore wire form.
  The *place* is a `place` link on the moment; this is what the sender wrote,
  which we must be able to replay verbatim and cannot always resolve.
- ``timezone`` — the TZID a DTSTART arrived with.
- ``invite_signature`` — the material snapshot of the last send, which decides
  whether a change warrants a SEQUENCE bump. It is a fact about what was
  *transmitted*, so it belongs beside the sequence it guards.

And both iMIP ledgers re-key from the event to the moment. They are the record of
what has already left the building, so they have to hang off the thing that can
leave it — a `sent_invites` row pointing at a table we are retiring would be the
one part of an outbound audit trail that vanishes with it.

`moment_id` is nullable and the old column is kept for now: the mail path is
being ported behind the mirror, and a ledger row that cannot find its moment must
degrade to "not yet sent" rather than to an exception in a loop that emails
people.

Revision ID: a6cbbb08a238
Revises: d2736a24fd5e
"""

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op

revision: str = "a6cbbb08a238"
down_revision: str | None = "d2736a24fd5e"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None

SCHEMA = "wild_life"
UUID = sa.dialects.postgresql.UUID(as_uuid=True)


def upgrade() -> None:
    for col in ("location", "timezone", "invite_signature"):
        op.add_column("calendar_records", sa.Column(col, sa.Text()), schema=SCHEMA)

    # Carry what the events already hold, matched through the moment each was
    # backfilled into.
    op.execute(f"""
        UPDATE {SCHEMA}.calendar_records c
        SET location = e.location,
            timezone = e.timezone,
            invite_signature = e.invite_signature
        FROM {SCHEMA}.moments m
        JOIN {SCHEMA}.events e ON m.source_ref = 'event:' || e.id
        WHERE c.moment_id = m.id
    """)

    for table in ("sent_invites", "attendee_responses"):
        op.add_column(
            table,
            sa.Column(
                "moment_id",
                UUID,
                sa.ForeignKey(f"{SCHEMA}.moments.id", ondelete="CASCADE"),
            ),
            schema=SCHEMA,
        )
        op.create_index(f"ix_{table}_moment", table, ["moment_id"], schema=SCHEMA)
        op.execute(f"""
            UPDATE {SCHEMA}.{table} t SET moment_id = m.id
            FROM {SCHEMA}.moments m
            WHERE m.source_ref = 'event:' || t.event_id
        """)

    # The uniqueness a REPLY upsert depends on, now per moment.
    op.execute(
        f"ALTER TABLE {SCHEMA}.attendee_responses "
        f"DROP CONSTRAINT IF EXISTS uq_attendee_response"
    )
    op.create_unique_constraint(
        "uq_attendee_response",
        "attendee_responses",
        ["moment_id", "attendee_email"],
        schema=SCHEMA,
    )


def downgrade() -> None:
    op.execute(
        f"ALTER TABLE {SCHEMA}.attendee_responses "
        f"DROP CONSTRAINT IF EXISTS uq_attendee_response"
    )
    op.create_unique_constraint(
        "uq_attendee_response",
        "attendee_responses",
        ["event_id", "attendee_email"],
        schema=SCHEMA,
    )
    for table in ("sent_invites", "attendee_responses"):
        op.drop_index(f"ix_{table}_moment", table, schema=SCHEMA)
        op.drop_column(table, "moment_id", schema=SCHEMA)
    for col in ("location", "timezone", "invite_signature"):
        op.drop_column("calendar_records", col, schema=SCHEMA)
