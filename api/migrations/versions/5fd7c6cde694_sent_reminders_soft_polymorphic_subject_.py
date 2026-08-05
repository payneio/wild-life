"""sent_reminders: soft polymorphic subject (moment|routine)

The ledger keyed on ``moment_id -> moments`` (a FK), so it could only record a
reminder for a stored occasion. A projected series is not a row (``domain.md``:
a rule's occurrences are *computed, never materialised*), so the tick's insert
for a routine violated the FK, the commit rolled back, no ledger row was
written, and every subsequent tick re-sent the same reminder.

Replace the FK with a soft polymorphic subject (``subject_type`` /
``subject_id``, no constraint), where ``subject_type`` is ``moment`` for a
stored occasion and ``routine`` for a projected series. Every existing row was a
moment, so backfill it as such before enforcing NOT NULL.

Revision ID: 5fd7c6cde694
Revises: c1d2e3f4a5b6
Create Date: 2026-08-05 15:58:44.467409
"""

from collections.abc import Sequence

from alembic import op
import sqlalchemy as sa

revision: str = "5fd7c6cde694"
down_revision: str | None = "c1d2e3f4a5b6"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    # Add nullable, backfill from the old FK column, then enforce.
    op.add_column(
        "sent_reminders",
        sa.Column("subject_type", sa.Text(), nullable=True),
        schema="wild_life",
    )
    op.add_column(
        "sent_reminders",
        sa.Column("subject_id", sa.UUID(), nullable=True),
        schema="wild_life",
    )
    # Every pre-existing row referenced a stored moment.
    op.execute(
        "UPDATE wild_life.sent_reminders "
        "SET subject_type = 'moment', subject_id = moment_id"
    )
    op.alter_column(
        "sent_reminders", "subject_type", nullable=False, schema="wild_life"
    )
    op.alter_column("sent_reminders", "subject_id", nullable=False, schema="wild_life")

    op.drop_constraint(
        op.f("uq_sent_reminder"),
        "sent_reminders",
        schema="wild_life",
        type_="unique",
    )
    op.drop_constraint(
        op.f("fk_sent_reminders_moment"),
        "sent_reminders",
        schema="wild_life",
        type_="foreignkey",
    )
    op.drop_index(
        op.f("ix_wild_life_sent_reminders_event_id"),
        table_name="sent_reminders",
        schema="wild_life",
    )
    op.drop_column("sent_reminders", "moment_id", schema="wild_life")

    op.create_index(
        op.f("ix_wild_life_sent_reminders_subject_id"),
        "sent_reminders",
        ["subject_id"],
        unique=False,
        schema="wild_life",
    )
    op.create_unique_constraint(
        "uq_sent_reminder",
        "sent_reminders",
        ["subject_type", "subject_id", "occurrence_start", "lead_minutes"],
        schema="wild_life",
    )


def downgrade() -> None:
    # Reinstating the FK drops routine-subject rows, which have no moment to
    # point at; only moment-subject rows survive the round trip.
    op.add_column(
        "sent_reminders",
        sa.Column("moment_id", sa.UUID(), autoincrement=False, nullable=True),
        schema="wild_life",
    )
    op.execute("DELETE FROM wild_life.sent_reminders WHERE subject_type <> 'moment'")
    op.execute("UPDATE wild_life.sent_reminders SET moment_id = subject_id")
    op.alter_column("sent_reminders", "moment_id", nullable=False, schema="wild_life")

    op.drop_constraint(
        "uq_sent_reminder", "sent_reminders", schema="wild_life", type_="unique"
    )
    op.drop_index(
        op.f("ix_wild_life_sent_reminders_subject_id"),
        table_name="sent_reminders",
        schema="wild_life",
    )
    op.drop_column("sent_reminders", "subject_id", schema="wild_life")
    op.drop_column("sent_reminders", "subject_type", schema="wild_life")

    op.create_foreign_key(
        op.f("fk_sent_reminders_moment"),
        "sent_reminders",
        "moments",
        ["moment_id"],
        ["id"],
        source_schema="wild_life",
        referent_schema="wild_life",
        ondelete="CASCADE",
    )
    op.create_index(
        op.f("ix_wild_life_sent_reminders_event_id"),
        "sent_reminders",
        ["moment_id"],
        unique=False,
        schema="wild_life",
    )
    op.create_unique_constraint(
        op.f("uq_sent_reminder"),
        "sent_reminders",
        ["moment_id", "occurrence_start", "lead_minutes"],
        schema="wild_life",
    )
