"""retire the last `personal_api` identifiers

The service was renamed to wild-life-api long ago, but 48 indexes and 3 foreign
keys created before the rename still carry the old name. They were left alone as
"a separate concern" each time autogenerate surfaced them (see b29623e206f2),
which meant every `alembic check` since has been drowned in the same 100-line
diff — noise loud enough to hide a real one. This clears it.

The target prefix is `wild_life`, not `wild_life_api`: SQLAlchemy names an
`index=True` column's index `ix_{schema}_{table}_{column}`, and the schema is
`wild_life` (db/base.py). Those are the names autogenerate compares against, so
any other spelling would leave the drift in place while looking tidier.

Revision ID: b7d8e9f0a1c2
Revises: a1c2e3d4f5b6
Create Date: 2026-07-26 10:30:00.000000
"""

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op


revision: str = "b7d8e9f0a1c2"
down_revision: str | None = "a1c2e3d4f5b6"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None

SCHEMA = "wild_life"
OLD = "personal_api"

# Indexes from before the schema prefix was applied at all. Same drift, other
# spelling — autogenerate wants these under `ix_wild_life_` too.
UNPREFIXED = [
    "events_entity_id",
    "goals_condition_id",
    "metrics_condition_id",
    "routine_instances_medication_id",
    "routines_medication_id",
    "routines_protocol_id",
]

# Hand-authored composite/partial indexes (ix_notes_*_trgm, ix_entity_links_target,
# ix_note_mentions_target, uq_*) are deliberately untouched: they aren't generated
# from `index=True`, so autogenerate never had an opinion about their names.


def upgrade() -> None:
    # Driven off the catalog rather than a hand-listed 48 names — a literal list
    # is a snapshot, stale the moment another branch adds a table.
    op.execute(
        sa.text(f"""
        DO $$
        DECLARE r record;
        BEGIN
            FOR r IN
                SELECT indexname AS name FROM pg_indexes
                WHERE schemaname = '{SCHEMA}'
                  AND indexname ^@ 'ix_{OLD}_'
            LOOP
                EXECUTE format(
                    'ALTER INDEX {SCHEMA}.%I RENAME TO %I',
                    r.name,
                    'ix_{SCHEMA}' || substr(r.name, {len(OLD) + 4})
                );
            END LOOP;

            FOR r IN
                SELECT c.conname AS name, t.relname AS tbl
                FROM pg_constraint c
                JOIN pg_class t ON t.oid = c.conrelid
                JOIN pg_namespace n ON n.oid = c.connamespace
                WHERE n.nspname = '{SCHEMA}'
                  AND c.conname ^@ 'fk_{OLD}_'
            LOOP
                EXECUTE format(
                    'ALTER TABLE {SCHEMA}.%I RENAME CONSTRAINT %I TO %I',
                    r.tbl,
                    r.name,
                    'fk_{SCHEMA}' || substr(r.name, {len(OLD) + 4})
                );
            END LOOP;
        END $$;
        """)
    )
    for stem in UNPREFIXED:
        op.execute(
            sa.text(f"ALTER INDEX {SCHEMA}.ix_{stem} RENAME TO ix_{SCHEMA}_{stem}")
        )


def downgrade() -> None:
    # Only the ones we can name exactly. Sweeping `ix_wild_life_*` back to the old
    # prefix would also rename every index that has *always* been called that
    # (sent_invites, attendee_responses, …) — a downgrade that loses information
    # is worse than one that declines to restore a cosmetic name.
    for stem in UNPREFIXED:
        op.execute(
            sa.text(f"ALTER INDEX {SCHEMA}.ix_{SCHEMA}_{stem} RENAME TO ix_{stem}")
        )
