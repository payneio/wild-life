"""unify routines M2 — backfill: fold protocol_items into routines and
medication_doses into routine_instances

Stage 3. Copies every dose line (``protocol_items``) into ``routines`` (a routine
that takes a medication and/or belongs to a protocol), folds old habit routines'
``name`` into ``activity``, and copies logged doses (``medication_doses``) into
``routine_instances`` (mapped to the matching dose routine by medication + slot).
Then dedups instances and adds the (routine, date, slot) unique index.

Best-effort and effectively one-way (a full snapshot lives in schema
``wild_life_backup``). The old tables are dropped in M3 after the cutover.

Revision ID: b8e2f04c1d59
Revises: a7d1e94c2f36
Create Date: 2026-07-19
"""

from alembic import op
from sqlalchemy import text

revision = "b8e2f04c1d59"
down_revision = "a7d1e94c2f36"
branch_labels = None
depends_on = None

SCHEMA = "wild_life"


def upgrade() -> None:
    conn = op.get_bind()

    # 1. Old habit routines: the label lives in ``activity`` now.
    conn.execute(
        text(
            f"""
            UPDATE {SCHEMA}.routines
            SET activity = name
            WHERE activity IS NULL AND medication_id IS NULL AND protocol_id IS NULL
            """
        )
    )

    # 2. Every dose line becomes a routine (same cadence/dose columns, 1:1).
    conn.execute(
        text(
            f"""
            INSERT INTO {SCHEMA}.routines
                (id, protocol_id, medication_id, activity, amount, timing,
                 days_of_week, interval_days, as_needed, trigger, sort_order,
                 notes, status, created_at, updated_at)
            SELECT gen_random_uuid(), pi.protocol_id, pi.medication_id, pi.activity,
                   pi.amount, pi.timing, pi.days_of_week, pi.interval_days,
                   pi.as_needed, pi.trigger, pi.sort_order, pi.notes, 'active',
                   pi.created_at, pi.updated_at
            FROM {SCHEMA}.protocol_items pi
            """
        )
    )

    # 3. Logged doses become routine instances, mapped to the matching dose
    #    routine (same medication carrying that slot; lowest sort_order wins).
    conn.execute(
        text(
            f"""
            INSERT INTO {SCHEMA}.routine_instances
                (id, routine_id, scheduled_date, slot, status, completed_at,
                 created_at, updated_at)
            SELECT gen_random_uuid(), r.id, md.dose_date, md.slot, 'done',
                   md.taken_at, md.created_at, md.updated_at
            FROM {SCHEMA}.medication_doses md
            JOIN LATERAL (
                SELECT r2.id
                FROM {SCHEMA}.routines r2
                WHERE r2.medication_id = md.medication_id
                  AND md.slot = ANY(r2.timing)
                ORDER BY r2.sort_order
                LIMIT 1
            ) r ON true
            """
        )
    )

    # 4. Dedup instances on (routine, date, slot), then enforce it.
    conn.execute(
        text(
            f"""
            DELETE FROM {SCHEMA}.routine_instances a
            USING {SCHEMA}.routine_instances b
            WHERE a.ctid < b.ctid
              AND a.routine_id = b.routine_id
              AND a.scheduled_date = b.scheduled_date
              AND a.slot = b.slot
            """
        )
    )
    op.create_index(
        "uq_routine_instance",
        "routine_instances",
        ["routine_id", "scheduled_date", "slot"],
        unique=True,
        schema=SCHEMA,
    )


def downgrade() -> None:
    # Best-effort; the authoritative rollback is restoring wild_life_backup.
    op.drop_index("uq_routine_instance", table_name="routine_instances", schema=SCHEMA)
    conn = op.get_bind()
    # Routines copied from dose lines are exactly those with a med or protocol
    # link (old habits have neither); their instances cascade-delete.
    conn.execute(
        text(
            f"DELETE FROM {SCHEMA}.routines "
            f"WHERE medication_id IS NOT NULL OR protocol_id IS NOT NULL"
        )
    )
    conn.execute(
        text(
            f"UPDATE {SCHEMA}.routines SET activity = NULL WHERE activity = name"
        )
    )
