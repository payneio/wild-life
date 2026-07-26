"""calendar mail: invites, responses, preferences

Adds outbound-invite hosting + inbound RSVP tracking + a generic preferences
store. Only the calendar-mail changes are here; the autogenerate also surfaced
pre-existing ``personal_api`` → ``wild_life`` index-rename drift, which is
intentionally left out (a separate concern, not introduced by this change).

Revision ID: b29623e206f2
Revises: a6b7c8d9e0f1
Create Date: 2026-07-22 23:03:53.042073
"""

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects import postgresql

revision: str = "b29623e206f2"
down_revision: str | None = "a6b7c8d9e0f1"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None

SCHEMA = "wild_life"


def upgrade() -> None:
    # Hosting + soft-cancel columns on events.
    op.add_column(
        "events",
        sa.Column(
            "invites_enabled",
            sa.Boolean(),
            server_default="false",
            nullable=False,
        ),
        schema=SCHEMA,
    )
    op.add_column(
        "events",
        sa.Column("cancelled_at", sa.DateTime(timezone=True), nullable=True),
        schema=SCHEMA,
    )
    op.add_column(
        "events",
        sa.Column("invite_signature", sa.Text(), nullable=True),
        schema=SCHEMA,
    )

    # Generic single-user preferences KV.
    op.create_table(
        "preferences",
        sa.Column("key", sa.Text(), nullable=False),
        sa.Column(
            "value",
            postgresql.JSONB(astext_type=sa.Text()),
            server_default="{}",
            nullable=False,
        ),
        sa.Column(
            "updated_at",
            sa.DateTime(timezone=True),
            server_default=sa.text("now()"),
            nullable=False,
        ),
        sa.PrimaryKeyConstraint("key"),
        schema=SCHEMA,
    )

    # Outbound iMIP ledger (idempotency for the mail tick).
    op.create_table(
        "sent_invites",
        sa.Column("event_id", sa.UUID(), nullable=False),
        sa.Column("attendee_email", sa.Text(), nullable=False),
        sa.Column("method", sa.Text(), nullable=False),
        sa.Column("sequence", sa.Integer(), nullable=False),
        sa.Column(
            "id",
            sa.UUID(),
            server_default=sa.text("gen_random_uuid()"),
            nullable=False,
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
            ["event_id"], [f"{SCHEMA}.events.id"], ondelete="CASCADE"
        ),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint(
            "event_id",
            "attendee_email",
            "method",
            "sequence",
            name="uq_sent_invite",
        ),
        schema=SCHEMA,
    )
    op.create_index(
        op.f("ix_wild_life_sent_invites_event_id"),
        "sent_invites",
        ["event_id"],
        unique=False,
        schema=SCHEMA,
    )

    # Inbound per-guest RSVP responses to events I host.
    op.create_table(
        "attendee_responses",
        sa.Column("event_id", sa.UUID(), nullable=False),
        sa.Column("attendee_email", sa.Text(), nullable=False),
        sa.Column("partstat", sa.Text(), nullable=False),
        sa.Column("comment", sa.Text(), nullable=True),
        sa.Column("sequence", sa.Integer(), nullable=True),
        sa.Column("responded_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column(
            "id",
            sa.UUID(),
            server_default=sa.text("gen_random_uuid()"),
            nullable=False,
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
            ["event_id"], [f"{SCHEMA}.events.id"], ondelete="CASCADE"
        ),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("event_id", "attendee_email", name="uq_attendee_response"),
        schema=SCHEMA,
    )
    op.create_index(
        op.f("ix_wild_life_attendee_responses_event_id"),
        "attendee_responses",
        ["event_id"],
        unique=False,
        schema=SCHEMA,
    )


def downgrade() -> None:
    op.drop_index(
        op.f("ix_wild_life_attendee_responses_event_id"),
        table_name="attendee_responses",
        schema=SCHEMA,
    )
    op.drop_table("attendee_responses", schema=SCHEMA)
    op.drop_index(
        op.f("ix_wild_life_sent_invites_event_id"),
        table_name="sent_invites",
        schema=SCHEMA,
    )
    op.drop_table("sent_invites", schema=SCHEMA)
    op.drop_table("preferences", schema=SCHEMA)
    op.drop_column("events", "invite_signature", schema=SCHEMA)
    op.drop_column("events", "cancelled_at", schema=SCHEMA)
    op.drop_column("events", "invites_enabled", schema=SCHEMA)
