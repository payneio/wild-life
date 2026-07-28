"""the ledgers key on the moment now

`sent_invites.event_id` and `attendee_responses.event_id` were NOT NULL, so the
ported mail path — which writes `moment_id` — could not insert at all. The old
column stays for the moment (it is the audit trail of what has already left the
building, and dropping it in the same step that starts writing the new one would
leave no way to check the two agree), but it can no longer be required.

Revision ID: de23f1491670
Revises: a6cbbb08a238
"""

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op

revision: str = "de23f1491670"
down_revision: str | None = "a6cbbb08a238"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None

SCHEMA = "wild_life"
UUID = sa.dialects.postgresql.UUID(as_uuid=True)


def upgrade() -> None:
    for table in ("sent_invites", "attendee_responses"):
        op.alter_column(
            table, "event_id", existing_type=UUID, nullable=True, schema=SCHEMA
        )


def downgrade() -> None:
    for table in ("sent_invites", "attendee_responses"):
        op.execute(f"DELETE FROM {SCHEMA}.{table} WHERE event_id IS NULL")
        op.alter_column(
            table, "event_id", existing_type=UUID, nullable=False, schema=SCHEMA
        )
