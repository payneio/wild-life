"""metric groups: numbers you read together

A blood draw, a cuff reading, a monthly look at every balance: one *act*
producing several values. Those values share a moment, share a context
("fasting"), and any ratio between them is only meaningful within that act.
None of that had anywhere to live — entering a lipid panel meant five separate
trips through the entry box, producing five timestamps that ought to be one.

- `metric_groups` / `group_members` — what is read together, in the order a lab
  reports it. Membership is never required: a metabolic panel in the imported
  spreadsheet came back with one of fourteen.
- `group_readings` — the occasion, so "fasting" and "which lab" belong to the
  draw rather than being copied onto every number.
- `metric_entries.group_reading_id` — nullable, because weighing yourself on a
  Tuesday is a reading with no occasion. SET NULL on delete: dropping the record
  of a draw must not take the numbers with it.
- `metrics.numerator_metric_id` / `denominator_metric_id` — operands for the new
  `ratio` and `percent` derivations, which pair readings *by occasion*. That
  pairing is why the grouping matters beyond ergonomics, and it fixes a real
  error: the source sheet stored `TRI/HDL = 120` on a draw with no
  triglycerides at all.

Revision ID: b8b162a4d021
Revises: e4f5a7b8c9d0
Create Date: 2026-07-27 23:16:55.630029
"""

from collections.abc import Sequence

from alembic import op
import sqlalchemy as sa


revision: str = "b8b162a4d021"
down_revision: str | None = "e4f5a7b8c9d0"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.create_table(
        "metric_groups",
        sa.Column("name", sa.Text(), nullable=False),
        sa.Column("entity_type", sa.Text(), nullable=False),
        sa.Column("entity_id", sa.UUID(), nullable=False),
        sa.Column("description", sa.Text(), nullable=True),
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
        "ix_metric_groups_root",
        "metric_groups",
        ["entity_type", "entity_id"],
        unique=False,
        schema="wild_life",
    )
    op.create_table(
        "group_members",
        sa.Column("group_id", sa.UUID(), nullable=False),
        sa.Column("metric_id", sa.UUID(), nullable=False),
        sa.Column("position", sa.Integer(), server_default="0", nullable=False),
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
        sa.ForeignKeyConstraint(
            ["group_id"], ["wild_life.metric_groups.id"], ondelete="CASCADE"
        ),
        sa.ForeignKeyConstraint(
            ["metric_id"], ["wild_life.metrics.id"], ondelete="CASCADE"
        ),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("group_id", "metric_id", name="uq_group_members_pair"),
        schema="wild_life",
    )
    op.create_index(
        "ix_group_members_group",
        "group_members",
        ["group_id"],
        unique=False,
        schema="wild_life",
    )
    op.create_table(
        "group_readings",
        sa.Column("group_id", sa.UUID(), nullable=False),
        sa.Column("recorded_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("context", sa.Text(), nullable=True),
        sa.Column("event_id", sa.UUID(), nullable=True),
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
        sa.ForeignKeyConstraint(
            ["event_id"], ["wild_life.events.id"], ondelete="SET NULL"
        ),
        sa.ForeignKeyConstraint(
            ["group_id"], ["wild_life.metric_groups.id"], ondelete="CASCADE"
        ),
        sa.PrimaryKeyConstraint("id"),
        schema="wild_life",
    )
    op.create_index(
        "ix_group_readings_group_at",
        "group_readings",
        ["group_id", "recorded_at"],
        unique=False,
        schema="wild_life",
    )
    op.create_index(
        op.f("ix_wild_life_group_readings_recorded_at"),
        "group_readings",
        ["recorded_at"],
        unique=False,
        schema="wild_life",
    )
    op.add_column(
        "metric_entries",
        sa.Column("group_reading_id", sa.UUID(), nullable=True),
        schema="wild_life",
    )
    op.create_index(
        op.f("ix_wild_life_metric_entries_group_reading_id"),
        "metric_entries",
        ["group_reading_id"],
        unique=False,
        schema="wild_life",
    )
    op.create_foreign_key(
        "fk_metric_entries_group_reading",
        "metric_entries",
        "group_readings",
        ["group_reading_id"],
        ["id"],
        source_schema="wild_life",
        referent_schema="wild_life",
        ondelete="SET NULL",
    )
    op.add_column(
        "metrics",
        sa.Column("numerator_metric_id", sa.UUID(), nullable=True),
        schema="wild_life",
    )
    op.add_column(
        "metrics",
        sa.Column("denominator_metric_id", sa.UUID(), nullable=True),
        schema="wild_life",
    )
    op.create_foreign_key(
        "fk_metrics_numerator",
        "metrics",
        "metrics",
        ["numerator_metric_id"],
        ["id"],
        source_schema="wild_life",
        referent_schema="wild_life",
        ondelete="CASCADE",
    )
    op.create_foreign_key(
        "fk_metrics_denominator",
        "metrics",
        "metrics",
        ["denominator_metric_id"],
        ["id"],
        source_schema="wild_life",
        referent_schema="wild_life",
        ondelete="CASCADE",
    )


def downgrade() -> None:
    op.drop_constraint(
        "fk_metrics_denominator", "metrics", schema="wild_life", type_="foreignkey"
    )
    op.drop_constraint(
        "fk_metrics_numerator", "metrics", schema="wild_life", type_="foreignkey"
    )
    op.drop_column("metrics", "denominator_metric_id", schema="wild_life")
    op.drop_column("metrics", "numerator_metric_id", schema="wild_life")
    op.drop_constraint(
        "fk_metric_entries_group_reading",
        "metric_entries",
        schema="wild_life",
        type_="foreignkey",
    )
    op.drop_index(
        op.f("ix_wild_life_metric_entries_group_reading_id"),
        table_name="metric_entries",
        schema="wild_life",
    )
    op.drop_column("metric_entries", "group_reading_id", schema="wild_life")
    op.drop_index(
        op.f("ix_wild_life_group_readings_recorded_at"),
        table_name="group_readings",
        schema="wild_life",
    )
    op.drop_index(
        "ix_group_readings_group_at", table_name="group_readings", schema="wild_life"
    )
    op.drop_table("group_readings", schema="wild_life")
    op.drop_index(
        "ix_group_members_group", table_name="group_members", schema="wild_life"
    )
    op.drop_table("group_members", schema="wild_life")
    op.drop_index(
        "ix_metric_groups_root", table_name="metric_groups", schema="wild_life"
    )
    op.drop_table("metric_groups", schema="wild_life")
