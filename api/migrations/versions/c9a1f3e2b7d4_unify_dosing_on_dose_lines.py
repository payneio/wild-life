"""unify dosing on dose lines (nullable protocol_id, drop medication.schedule)

Dosing now lives in exactly one place — a ``protocol_items`` row ("dose line").
``protocol_id`` becomes nullable so a standing/standalone dose (a daily vitamin)
is just a protocol-less line. Each medication that carried a standalone
``schedule`` (one with no dose line already covering it) is migrated to standing
lines, grouped by amount, then the ``schedule`` column is dropped.

Revision ID: c9a1f3e2b7d4
Revises: 745e9a805428
Create Date: 2026-07-18
"""

from collections import defaultdict

import sqlalchemy as sa
from alembic import op

revision = "c9a1f3e2b7d4"
down_revision = "745e9a805428"
branch_labels = None
depends_on = None

SCHEMA = "wild_life"


def upgrade() -> None:
    # 1) A dose line no longer requires a protocol.
    op.alter_column("protocol_items", "protocol_id", nullable=True, schema=SCHEMA)

    # 2) Migrate standalone medication schedules to standing dose lines. Only
    #    meds not already covered by a timed dose line, so we never duplicate.
    conn = op.get_bind()
    rows = conn.execute(
        sa.text(
            f"""
            SELECT m.id, m.schedule
            FROM {SCHEMA}.medications m
            WHERE jsonb_array_length(m.schedule) > 0
              AND NOT EXISTS (
                  SELECT 1 FROM {SCHEMA}.protocol_items pi
                  WHERE pi.medication_id = m.id
                    AND COALESCE(array_length(pi.timing, 1), 0) > 0
              )
            """
        )
    ).all()
    insert = sa.text(
        f"""
        INSERT INTO {SCHEMA}.protocol_items
            (medication_id, amount, timing, sort_order)
        VALUES (:mid, :amount, CAST(:timing AS text[]), :sort)
        """
    )
    for mid, schedule in rows:
        by_amount: dict[str | None, list[str]] = defaultdict(list)
        for entry in schedule:
            by_amount[entry.get("amount")].append(entry["slot"])
        for i, (amount, slots) in enumerate(by_amount.items()):
            conn.execute(
                insert,
                {
                    "mid": mid,
                    "amount": amount,
                    "timing": "{" + ",".join(slots) + "}",
                    "sort": i,
                },
            )

    # 3) Dosing is fully represented by dose lines now.
    op.drop_column("medications", "schedule", schema=SCHEMA)


def downgrade() -> None:
    op.add_column(
        "medications",
        sa.Column(
            "schedule",
            sa.dialects.postgresql.JSONB(),
            server_default=sa.text("'[]'::jsonb"),
            nullable=False,
        ),
        schema=SCHEMA,
    )

    # Rebuild each med's schedule from its standing (protocol-less) dose lines.
    conn = op.get_bind()
    conn.execute(
        sa.text(
            f"""
            UPDATE {SCHEMA}.medications m
            SET schedule = sub.sched
            FROM (
                SELECT pi.medication_id AS mid,
                       jsonb_agg(jsonb_build_object('slot', s.slot, 'amount', pi.amount)) AS sched
                FROM {SCHEMA}.protocol_items pi
                CROSS JOIN LATERAL unnest(pi.timing) AS s(slot)
                WHERE pi.protocol_id IS NULL AND pi.medication_id IS NOT NULL
                GROUP BY pi.medication_id
            ) sub
            WHERE m.id = sub.mid
            """
        )
    )

    # Standing lines can't exist once protocol_id is required again.
    conn.execute(
        sa.text(f"DELETE FROM {SCHEMA}.protocol_items WHERE protocol_id IS NULL")
    )
    op.alter_column("protocol_items", "protocol_id", nullable=False, schema=SCHEMA)
