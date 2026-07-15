"""change_log notify trigger for live SSE

Revision ID: a199c43d41cf
Revises: 8c9e89f4c05b
Create Date: 2026-07-15 12:52:11.256788
"""

from collections.abc import Sequence

from alembic import op
import sqlalchemy as sa


revision: str = 'a199c43d41cf'
down_revision: str | None = '8c9e89f4c05b'
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    # Every entity insert/update/delete already writes one change_log row (audit
    # hook). One AFTER INSERT trigger on change_log therefore broadcasts every
    # change on the shared live channel, atomically on commit.
    op.execute(
        """
        CREATE OR REPLACE FUNCTION personal_api.notify_change() RETURNS trigger AS $$
        BEGIN
          PERFORM pg_notify(
            'personal_api_events',
            json_build_object(
              'kind', 'change',
              'entity_type', NEW.entity_type,
              'entity_id', NEW.entity_id,
              'action', NEW.action
            )::text
          );
          RETURN NEW;
        END;
        $$ LANGUAGE plpgsql;
        """
    )
    op.execute(
        """
        CREATE TRIGGER change_log_notify
        AFTER INSERT ON personal_api.change_log
        FOR EACH ROW EXECUTE FUNCTION personal_api.notify_change();
        """
    )


def downgrade() -> None:
    op.execute(
        "DROP TRIGGER IF EXISTS change_log_notify ON personal_api.change_log;"
    )
    op.execute("DROP FUNCTION IF EXISTS personal_api.notify_change();")
