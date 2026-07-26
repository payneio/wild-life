"""metric entries become instants (entry_date -> recorded_at)

A reading happens at a moment, not on a day — several a day is normal for a
vital, and the time is the only thing that tells those entries apart. Existing
rows carry only a day, so they land at local midnight of that day.

Revision ID: a1c2e3d4f5b6
Revises: b2c3d4e5f6a7
Create Date: 2026-07-26 10:00:00.000000
"""

from collections.abc import Sequence

from alembic import op
import sqlalchemy as sa


revision: str = "a1c2e3d4f5b6"
down_revision: str | None = "b2c3d4e5f6a7"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None

# The day a bare date meant. Single-user app, one zone; naming it here beats
# silently reading the server's UTC and shifting every entry back 8 hours.
LOCAL_TZ = "America/Los_Angeles"


def upgrade() -> None:
    op.alter_column(
        "metric_entries",
        "entry_date",
        new_column_name="recorded_at",
        type_=sa.DateTime(timezone=True),
        postgresql_using=f"entry_date::timestamp AT TIME ZONE '{LOCAL_TZ}'",
        existing_nullable=False,
        schema="wild_life",
    )
    # This index predates the rename, so it still carries the old prefix; the
    # follow-up migration renames what's left of them.
    op.drop_index(
        "ix_personal_api_metric_entries_entry_date",
        table_name="metric_entries",
        schema="wild_life",
    )
    op.create_index(
        "ix_wild_life_metric_entries_recorded_at",
        "metric_entries",
        ["recorded_at"],
        schema="wild_life",
    )

    # measurement_frequency is now a closed enum (MeasurementFrequency). Fold the
    # free text that used to be parsed by substring match into those values;
    # anything else never mapped to an interval, so it was already inert.
    # `strpos`, not LIKE '%week%': a bare `%` in DDL text is ambiguous under the
    # driver's pyformat paramstyle, and escaping it as `%%` is only correct for
    # one of the two paths. No wildcard, no ambiguity.
    op.execute(
        sa.text("""
        UPDATE wild_life.metrics SET measurement_frequency = CASE
            WHEN strpos(lower(measurement_frequency), 'week')    > 0 THEN 'weekly'
            WHEN strpos(lower(measurement_frequency), 'month')   > 0 THEN 'monthly'
            WHEN strpos(lower(measurement_frequency), 'quarter') > 0 THEN 'quarterly'
            WHEN strpos(lower(measurement_frequency), 'year')    > 0 THEN 'yearly'
            WHEN strpos(lower(measurement_frequency), 'annual')  > 0 THEN 'yearly'
            WHEN strpos(lower(measurement_frequency), 'day')     > 0 THEN 'daily'
            ELSE NULL
        END
        WHERE measurement_frequency IS NOT NULL
        """)
    )


def downgrade() -> None:
    op.drop_index(
        "ix_wild_life_metric_entries_recorded_at",
        table_name="metric_entries",
        schema="wild_life",
    )
    op.alter_column(
        "metric_entries",
        "recorded_at",
        new_column_name="entry_date",
        type_=sa.Date(),
        postgresql_using=f"(recorded_at AT TIME ZONE '{LOCAL_TZ}')::date",
        existing_nullable=False,
        schema="wild_life",
    )
    op.create_index(
        "ix_personal_api_metric_entries_entry_date",
        "metric_entries",
        ["entry_date"],
        schema="wild_life",
    )
