"""cadence learns months and weeks

Our cadence could say "every Tuesday" and "every 3 days" and nothing else, so
twelve of the seventy-four real series had no expression here and survived only
as wire form: 9 `FREQ=YEARLY` (every one of them a birthday) and 3
`FREQ=MONTHLY;BYDAY=1SA`-style. Three columns close it, and between them make a
small complete algebra:

- ``months``        — which months this applies in; empty means every month.
- ``day_of_month``  — the date within them.
- ``week_of_month`` — with ``days_of_week``, the *n*th such weekday (−1 = last).

    every 25 December        months=[12], day_of_month=25
    the 25th, monthly        day_of_month=25
    first Saturday monthly   week_of_month=1, days_of_week=[sat]
    fourth Thursday of Nov   months=[11], week_of_month=4, days_of_week=[thu]

``interval_days`` keeps striding days and weeks and is ignored when any of these
is set: "every 3 days, on the first Saturday" is two cadences arguing.

Revision ID: 1d4e71342134
Revises: de23f1491670
"""

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op

revision: str = "1d4e71342134"
down_revision: str | None = "de23f1491670"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None

SCHEMA = "wild_life"


def upgrade() -> None:
    op.add_column(
        "routines",
        sa.Column(
            "months",
            sa.dialects.postgresql.ARRAY(sa.Integer()),
            server_default="{}",
            nullable=False,
        ),
        schema=SCHEMA,
    )
    op.add_column("routines", sa.Column("day_of_month", sa.Integer()), schema=SCHEMA)
    op.add_column("routines", sa.Column("week_of_month", sa.Integer()), schema=SCHEMA)


def downgrade() -> None:
    op.drop_column("routines", "week_of_month", schema=SCHEMA)
    op.drop_column("routines", "day_of_month", schema=SCHEMA)
    op.drop_column("routines", "months", schema=SCHEMA)
