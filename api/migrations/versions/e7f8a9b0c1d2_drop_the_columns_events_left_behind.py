"""Drop the `event_id` columns that outlived the table they pointed at.

Four models carried one, and three of them said in a comment that it "stays
until `events` retires". It has. What is left is a foreign key to nothing —
which SQLAlchemy refuses to map at all, so this is not tidiness: the API would
not start.

Each is a different shape underneath, and they are not interchangeable:

* **`sent_invites`, `attendee_responses`** — every row carries a `moment_id`
  beside the `event_id`, so the column is redundant and the unique constraint
  moves onto the moment. These are the iMIP ledgers; the constraint is what
  stops a guest being emailed the same invitation twice, so it has to survive
  the move intact.
* **`group_readings.event_id`** — set on 0 of 63 rows. It was for "the draw
  really was an appointment you had already scheduled", and nothing ever said
  so. A reading is now its own `measurement` moment, which is the link that
  claim wanted.
* **`sent_reminders.event_id`** — actually holds moment ids now, under a name
  and a foreign key from before the cut-over. Renamed rather than dropped. The
  31 rows still holding pre-inversion event ids are deleted: this table is a
  "已 sent" ledger keyed to an occurrence, and a key that can never match again
  can only suppress nothing. The one row that resolves is kept.

Revision ID: e7f8a9b0c1d2
Revises: c4d5e6f7a8b9
"""

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op

revision: str = "e7f8a9b0c1d2"
down_revision: str | None = "c4d5e6f7a8b9"
branch_labels: Sequence[str] | None = None
depends_on: Sequence[str] | None = None


def upgrade() -> None:
    # --- the iMIP ledgers: the moment is the key now ------------------------
    op.execute(
        "ALTER TABLE wild_life.sent_invites DROP CONSTRAINT IF EXISTS uq_sent_invite"
    )
    op.drop_column("sent_invites", "event_id", schema="wild_life")
    op.create_unique_constraint(
        "uq_sent_invite",
        "sent_invites",
        ["moment_id", "attendee_email", "method", "sequence"],
        schema="wild_life",
    )
    op.drop_column("attendee_responses", "event_id", schema="wild_life")

    # --- a reading was never an appointment ---------------------------------
    op.drop_column("group_readings", "event_id", schema="wild_life")

    # --- reminders: the column already held moment ids ----------------------
    op.execute("""
        DELETE FROM wild_life.sent_reminders r
         WHERE NOT EXISTS (
                   SELECT 1 FROM wild_life.moments m WHERE m.id = r.event_id
               )
    """)
    op.execute(
        "ALTER TABLE wild_life.sent_reminders DROP CONSTRAINT IF EXISTS uq_sent_reminder"
    )
    op.alter_column(
        "sent_reminders", "event_id", new_column_name="moment_id", schema="wild_life"
    )
    op.create_unique_constraint(
        "uq_sent_reminder",
        "sent_reminders",
        ["moment_id", "occurrence_start", "lead_minutes"],
        schema="wild_life",
    )
    op.create_foreign_key(
        "fk_sent_reminders_moment",
        "sent_reminders",
        "moments",
        ["moment_id"],
        ["id"],
        source_schema="wild_life",
        referent_schema="wild_life",
        ondelete="CASCADE",
    )


def downgrade() -> None:
    """Restores the columns, not the rows they held.

    The `events` table is gone as of the previous revision, so these come back
    without their foreign key — which is the honest shape, since there is
    nothing left for them to reference.
    """
    op.drop_constraint(
        "fk_sent_reminders_moment", "sent_reminders", schema="wild_life"
    )
    op.execute(
        "ALTER TABLE wild_life.sent_reminders DROP CONSTRAINT IF EXISTS uq_sent_reminder"
    )
    op.alter_column(
        "sent_reminders", "moment_id", new_column_name="event_id", schema="wild_life"
    )
    op.create_unique_constraint(
        "uq_sent_reminder",
        "sent_reminders",
        ["event_id", "occurrence_start", "lead_minutes"],
        schema="wild_life",
    )
    op.add_column(
        "group_readings",
        sa.Column("event_id", sa.UUID(), nullable=True),
        schema="wild_life",
    )
    op.add_column(
        "attendee_responses",
        sa.Column("event_id", sa.UUID(), nullable=True),
        schema="wild_life",
    )
    op.execute(
        "ALTER TABLE wild_life.sent_invites DROP CONSTRAINT IF EXISTS uq_sent_invite"
    )
    op.add_column(
        "sent_invites",
        sa.Column("event_id", sa.UUID(), nullable=True),
        schema="wild_life",
    )
    op.create_unique_constraint(
        "uq_sent_invite",
        "sent_invites",
        ["event_id", "attendee_email", "method", "sequence"],
        schema="wild_life",
    )
