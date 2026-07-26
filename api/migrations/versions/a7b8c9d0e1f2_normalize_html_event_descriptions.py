"""normalize HTML event descriptions to plain text

Calendar DESCRIPTIONs imported from Google/Outlook/Teams carry HTML that renders
as literal markup in the UI (the field is edited in a plain textarea). It also
pollutes event full-text search, and would be echoed into any invite we sent for
those events. This converts the affected rows in place using the very same
`wild_life.richtext.normalize_description` the ingest path now calls, so stored
text and newly-ingested text cannot disagree.

Rows are selected in Python by the allow-list tag detector, NOT by a SQL
`LIKE '%<%'`: ~40 plain-text Outlook bodies use RFC-2822 angle-bracket link
syntax (`Need help?<https://aka.ms/JoinTeamsMeeting>`) that an HTML parser would
swallow, destroying the URL. The detector leaves those untouched.

No mail side-effects: `_signature()` in routers/calendar_mail.py excludes
`description`, so rewriting it bumps no SEQUENCE and triggers no resend.

Revision ID: a7b8c9d0e1f2
Revises: e6f7a8b9c0d1
Create Date: 2026-07-26
"""

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op

from wild_life.richtext import normalize_description

revision: str = "a7b8c9d0e1f2"
down_revision: str | None = "e6f7a8b9c0d1"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    conn = op.get_bind()
    rows = conn.execute(
        sa.text(
            "SELECT id, description FROM wild_life.events "
            "WHERE description IS NOT NULL AND description <> ''"
        )
    ).all()

    changed = 0
    for row_id, description in rows:
        normalized = normalize_description(description)
        if normalized == description:
            continue
        conn.execute(
            sa.text("UPDATE wild_life.events SET description = :d WHERE id = :i"),
            {"d": normalized, "i": row_id},
        )
        changed += 1

    print(f"normalized {changed} of {len(rows)} non-empty event descriptions")


def downgrade() -> None:
    # One-way. The HTML source was never stored anywhere else — there is no
    # second copy to restore from, so inverting this is not possible. Restore
    # the pre-migration dump of wild_life.events if you must revert.
    pass
