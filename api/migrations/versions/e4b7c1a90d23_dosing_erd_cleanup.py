"""dosing ERD cleanup: drop redundant med fields, FHIR-style dose-line cadence

Medications: drop ``generic_name`` (redundant with ``name``) and ``dose``
(redundant with a dose line's ``amount`` × the med's ``form``).

Dose lines (``protocol_items``): rename ``substance`` → ``activity`` (a
non-medication step); ``amount`` text → numeric (dose quantity); replace free-text
``frequency`` with structured cadence — ``days_of_week`` (empty = daily),
``interval_days`` (every-N-days) — plus an ``as_needed`` (PRN) flag.

Revision ID: e4b7c1a90d23
Revises: c9a1f3e2b7d4
Create Date: 2026-07-18
"""

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects import postgresql

revision = "e4b7c1a90d23"
down_revision = "c9a1f3e2b7d4"
branch_labels = None
depends_on = None

SCHEMA = "wild_life"


def upgrade() -> None:
    # Medications: drop the two redundant fields.
    op.drop_column("medications", "generic_name", schema=SCHEMA)
    op.drop_column("medications", "dose", schema=SCHEMA)

    # Dose lines: rename substance -> activity.
    op.alter_column(
        "protocol_items", "substance", new_column_name="activity", schema=SCHEMA
    )

    # amount: text -> numeric (strip any stray unit text; blanks -> NULL).
    op.alter_column(
        "protocol_items",
        "amount",
        type_=sa.Numeric(),
        postgresql_using="NULLIF(regexp_replace(coalesce(amount, ''), '[^0-9.]', '', 'g'), '')::numeric",
        existing_type=sa.Text(),
        schema=SCHEMA,
    )

    # Structured cadence replaces free-text frequency.
    op.add_column(
        "protocol_items",
        sa.Column(
            "days_of_week",
            postgresql.ARRAY(sa.Text()),
            server_default="{}",
            nullable=False,
        ),
        schema=SCHEMA,
    )
    op.add_column(
        "protocol_items",
        sa.Column("interval_days", sa.Integer(), server_default="1", nullable=False),
        schema=SCHEMA,
    )
    op.add_column(
        "protocol_items",
        sa.Column("as_needed", sa.Boolean(), server_default="false", nullable=False),
        schema=SCHEMA,
    )
    op.drop_column("protocol_items", "frequency", schema=SCHEMA)


def downgrade() -> None:
    op.add_column(
        "protocol_items",
        sa.Column("frequency", sa.Text(), nullable=True),
        schema=SCHEMA,
    )
    op.drop_column("protocol_items", "as_needed", schema=SCHEMA)
    op.drop_column("protocol_items", "interval_days", schema=SCHEMA)
    op.drop_column("protocol_items", "days_of_week", schema=SCHEMA)
    op.alter_column(
        "protocol_items",
        "amount",
        type_=sa.Text(),
        postgresql_using="amount::text",
        existing_type=sa.Numeric(),
        schema=SCHEMA,
    )
    op.alter_column(
        "protocol_items", "activity", new_column_name="substance", schema=SCHEMA
    )
    op.add_column(
        "medications",
        sa.Column("dose", sa.Text(), nullable=True),
        schema=SCHEMA,
    )
    op.add_column(
        "medications",
        sa.Column("generic_name", sa.Text(), nullable=True),
        schema=SCHEMA,
    )
