"""moments — the spine, additive

Phase 2 of the moment inversion (see `api/docs/moments.md`). Creates the tables
and nothing else: no backfill, no reads, no drops. Existing writes keep going to
`notes`, `events` and the rest, so this migration changes no behaviour — it only
makes the shape available to prove against real data.

  moments          what happened, or what you intend to happen. Occurrence
                   (`started_at`) and intention (`window_start`/`window_end`)
                   are separate columns on one row, because the delta between
                   them is how estimation improves. A lapse is derived from
                   them, never written.
  moment_links     what a moment involves, in one of four roles. Surrogate `id`
                   rather than the natural tuple, because payload hangs off it.
  moment_readings  the value a measurement produced, per metric it measured.
  moment_doses     how much of one medication a dose moment took.
  calendar_records the shared projection — the only thing that can leave this
                   system, which is what makes privacy structural.
  dependencies     "this cannot start until that is done", as an edge, replacing
                   a single-blocker column and a free-text field.

Revision ID: 12ca48f1b0d9
Revises: b8b162a4d021
Create Date: 2026-07-28
"""

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects import postgresql

revision: str = "12ca48f1b0d9"
down_revision: str | None = "b8b162a4d021"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.create_table(
        "dependencies",
        sa.Column("dependent_type", sa.Text(), nullable=False),
        sa.Column("dependent_id", sa.UUID(), nullable=False),
        sa.Column("blocker_type", sa.Text(), nullable=False),
        sa.Column("blocker_id", sa.UUID(), nullable=False),
        sa.Column(
            "id", sa.UUID(), server_default=sa.text("gen_random_uuid()"), nullable=False
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
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint(
            "dependent_type",
            "dependent_id",
            "blocker_type",
            "blocker_id",
            name="uq_dependencies_edge",
        ),
        schema="wild_life",
    )
    op.create_index(
        "ix_dependencies_blocker",
        "dependencies",
        ["blocker_type", "blocker_id"],
        unique=False,
        schema="wild_life",
    )
    op.create_table(
        "moments",
        sa.Column("kind", sa.Text(), nullable=False),
        sa.Column("started_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("ended_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("all_day", sa.Boolean(), server_default="false", nullable=False),
        sa.Column("window_start", sa.DateTime(timezone=True), nullable=True),
        sa.Column("window_end", sa.DateTime(timezone=True), nullable=True),
        sa.Column("expected_minutes", sa.Integer(), nullable=True),
        sa.Column("title", sa.Text(), nullable=True),
        sa.Column("body", sa.Text(), server_default="", nullable=False),
        sa.Column("source", sa.Text(), server_default="authored", nullable=False),
        sa.Column("withdrawn_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("withdrawal_reason", sa.Text(), nullable=True),
        sa.Column(
            "id", sa.UUID(), server_default=sa.text("gen_random_uuid()"), nullable=False
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
        sa.PrimaryKeyConstraint("id"),
        schema="wild_life",
    )
    op.create_index(
        "ix_moments_kind_started_at",
        "moments",
        ["kind", "started_at"],
        unique=False,
        schema="wild_life",
    )
    op.create_index(
        "ix_moments_started_at",
        "moments",
        ["started_at"],
        unique=False,
        schema="wild_life",
    )
    op.create_index(
        "ix_moments_window_end",
        "moments",
        ["window_end"],
        unique=False,
        schema="wild_life",
    )
    op.create_index(
        op.f("ix_wild_life_moments_kind"),
        "moments",
        ["kind"],
        unique=False,
        schema="wild_life",
    )
    op.create_index(
        op.f("ix_wild_life_moments_source"),
        "moments",
        ["source"],
        unique=False,
        schema="wild_life",
    )
    op.create_table(
        "calendar_records",
        sa.Column("moment_id", sa.UUID(), nullable=False),
        sa.Column("external_ref", sa.Text(), nullable=True),
        sa.Column(
            "attendees",
            postgresql.ARRAY(sa.Text()),
            server_default="{}",
            nullable=False,
        ),
        sa.Column("organizer", sa.Text(), nullable=True),
        sa.Column("sequence", sa.Integer(), nullable=True),
        sa.Column("rsvp_status", sa.Text(), nullable=True),
        sa.Column("rsvp_sent_status", sa.Text(), nullable=True),
        sa.Column(
            "invites_enabled", sa.Boolean(), server_default="false", nullable=False
        ),
        sa.Column("recurrence", sa.Text(), nullable=True),
        sa.Column(
            "recurrence_exdates",
            postgresql.ARRAY(sa.Text()),
            server_default="{}",
            nullable=False,
        ),
        sa.Column("recurrence_parent_id", sa.UUID(), nullable=True),
        sa.Column("recurrence_id", sa.DateTime(timezone=True), nullable=True),
        sa.Column("cancelled_at", sa.DateTime(timezone=True), nullable=True),
        sa.ForeignKeyConstraint(
            ["moment_id"], ["wild_life.moments.id"], ondelete="CASCADE"
        ),
        sa.ForeignKeyConstraint(
            ["recurrence_parent_id"], ["wild_life.moments.id"], ondelete="CASCADE"
        ),
        sa.PrimaryKeyConstraint("moment_id"),
        schema="wild_life",
    )
    op.create_index(
        op.f("ix_wild_life_calendar_records_external_ref"),
        "calendar_records",
        ["external_ref"],
        unique=False,
        schema="wild_life",
    )
    op.create_index(
        op.f("ix_wild_life_calendar_records_recurrence_parent_id"),
        "calendar_records",
        ["recurrence_parent_id"],
        unique=False,
        schema="wild_life",
    )
    op.create_table(
        "moment_links",
        sa.Column("moment_id", sa.UUID(), nullable=False),
        sa.Column("role", sa.Text(), nullable=False),
        sa.Column("entity_type", sa.Text(), nullable=False),
        sa.Column("entity_id", sa.UUID(), nullable=False),
        sa.Column(
            "id", sa.UUID(), server_default=sa.text("gen_random_uuid()"), nullable=False
        ),
        sa.ForeignKeyConstraint(
            ["moment_id"], ["wild_life.moments.id"], ondelete="CASCADE"
        ),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint(
            "moment_id", "role", "entity_type", "entity_id", name="uq_moment_links_edge"
        ),
        schema="wild_life",
    )
    op.create_index(
        "ix_moment_links_target",
        "moment_links",
        ["entity_type", "entity_id"],
        unique=False,
        schema="wild_life",
    )
    op.create_index(
        op.f("ix_wild_life_moment_links_moment_id"),
        "moment_links",
        ["moment_id"],
        unique=False,
        schema="wild_life",
    )
    op.create_table(
        "moment_doses",
        sa.Column("link_id", sa.UUID(), nullable=False),
        sa.Column("amount", sa.Float(), nullable=True),
        sa.Column("unit", sa.Text(), nullable=True),
        sa.ForeignKeyConstraint(
            ["link_id"], ["wild_life.moment_links.id"], ondelete="CASCADE"
        ),
        sa.PrimaryKeyConstraint("link_id"),
        schema="wild_life",
    )
    op.create_table(
        "moment_readings",
        sa.Column("link_id", sa.UUID(), nullable=False),
        sa.Column("value", sa.Float(), nullable=False),
        sa.Column("context", sa.Text(), nullable=True),
        sa.ForeignKeyConstraint(
            ["link_id"], ["wild_life.moment_links.id"], ondelete="CASCADE"
        ),
        sa.PrimaryKeyConstraint("link_id"),
        schema="wild_life",
    )


def downgrade() -> None:
    op.drop_table("moment_readings", schema="wild_life")
    op.drop_table("moment_doses", schema="wild_life")
    op.drop_index(
        op.f("ix_wild_life_moment_links_moment_id"),
        table_name="moment_links",
        schema="wild_life",
    )
    op.drop_index(
        "ix_moment_links_target", table_name="moment_links", schema="wild_life"
    )
    op.drop_table("moment_links", schema="wild_life")
    op.drop_index(
        op.f("ix_wild_life_calendar_records_recurrence_parent_id"),
        table_name="calendar_records",
        schema="wild_life",
    )
    op.drop_index(
        op.f("ix_wild_life_calendar_records_external_ref"),
        table_name="calendar_records",
        schema="wild_life",
    )
    op.drop_table("calendar_records", schema="wild_life")
    op.drop_index(
        op.f("ix_wild_life_moments_source"), table_name="moments", schema="wild_life"
    )
    op.drop_index(
        op.f("ix_wild_life_moments_kind"), table_name="moments", schema="wild_life"
    )
    op.drop_index("ix_moments_window_end", table_name="moments", schema="wild_life")
    op.drop_index("ix_moments_started_at", table_name="moments", schema="wild_life")
    op.drop_index(
        "ix_moments_kind_started_at", table_name="moments", schema="wild_life"
    )
    op.drop_table("moments", schema="wild_life")
    op.drop_index(
        "ix_dependencies_blocker", table_name="dependencies", schema="wild_life"
    )
    op.drop_table("dependencies", schema="wild_life")
