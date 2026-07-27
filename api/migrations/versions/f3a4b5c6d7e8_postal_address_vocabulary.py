"""one address vocabulary across locations, organizations and people

The app had three different ideas of an address: Location kept
`address`/`city`/`region`, Organization kept one free-text blob, and a Person's
addresses were `{value, label}` objects sharing the contact-method shape used by
phones and emails. None of them could hold a unit number, a postcode or a
country, which is why entering a real address was awkward — there was nowhere to
put half of it.

All three now use the components vCard's `ADR` (RFC 6350) and schema.org's
`PostalAddress` agree on: street, unit, city, region, postcode, country. Where a
record has one address they are columns, so they stay searchable and sortable;
where it has several they are the fields of a JSON object. See
`schemas/common.PostalAddress`.

**Nothing is parsed.** Splitting "1201 3rd Ave, Suite 400, Seattle WA 98101" into
components is a guess, and a wrong guess here is worse than an unsplit string: it
silently files a place at the wrong address. Existing free text moves into
`street` verbatim and the rest stays empty, so every character survives and you
can split what you care about by hand.

Revision ID: f3a4b5c6d7e8
Revises: e2f3a4b5c6d7
Create Date: 2026-07-27
"""

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op

revision: str = "f3a4b5c6d7e8"
down_revision: str | None = "e2f3a4b5c6d7"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None

_NEW = ("unit", "postcode", "country")


def upgrade() -> None:
    # --- locations ------------------------------------------------------------
    # `address` already held the street line, so this is a rename, not a move.
    op.alter_column(
        "locations", "address", new_column_name="street", schema="wild_life"
    )
    for column in _NEW:
        op.add_column(
            "locations", sa.Column(column, sa.Text(), nullable=True), schema="wild_life"
        )

    # --- organizations --------------------------------------------------------
    # Same rename: the blob was whatever someone typed, and `street` is the only
    # component we can honestly claim it belongs to.
    op.alter_column(
        "organizations", "address", new_column_name="street", schema="wild_life"
    )
    for column in ("unit", "city", "region", "postcode", "country"):
        op.add_column(
            "organizations",
            sa.Column(column, sa.Text(), nullable=True),
            schema="wild_life",
        )

    # --- people ---------------------------------------------------------------
    # `addresses` is a JSONB array of {value, label}; each entry becomes
    # {label, street} with the other components absent. WITH ORDINALITY because
    # jsonb_agg has no inherent order and a person's addresses are an ordered
    # list. The EXISTS guard makes re-running a no-op rather than wrapping the
    # structure a second time.
    op.execute(
        sa.text(
            """
            UPDATE wild_life.people p
            SET addresses = rewritten.value
            FROM (
                SELECT
                    src.id,
                    jsonb_agg(
                        jsonb_strip_nulls(
                            jsonb_build_object(
                                'label', entry.value->'label',
                                'street', entry.value->'value'
                            )
                        )
                        ORDER BY entry.ord
                    ) AS value
                FROM wild_life.people AS src,
                     jsonb_array_elements(src.addresses)
                         WITH ORDINALITY AS entry(value, ord)
                WHERE jsonb_array_length(src.addresses) > 0
                GROUP BY src.id
            ) AS rewritten
            WHERE p.id = rewritten.id
              AND EXISTS (
                  SELECT 1 FROM jsonb_array_elements(p.addresses) AS e
                  WHERE e ? 'value'
              )
            """
        )
    )


def downgrade() -> None:
    op.execute(
        sa.text(
            """
            UPDATE wild_life.people p
            SET addresses = reverted.value
            FROM (
                SELECT
                    src.id,
                    jsonb_agg(
                        jsonb_build_object(
                            'label', entry.value->'label',
                            -- Flatten back to one string; components the old
                            -- shape had no room for are folded in rather than
                            -- lost. No trimming: concat_ws already skips empty
                            -- parts, and trimming punctuation here would eat a
                            -- trailing comma that was someone's actual data.
                            'value', concat_ws(', ',
                                nullif(concat_ws(' ',
                                    entry.value->>'street',
                                    entry.value->>'unit'), ''),
                                entry.value->>'city',
                                entry.value->>'region',
                                entry.value->>'postcode',
                                entry.value->>'country')
                        )
                        ORDER BY entry.ord
                    ) AS value
                FROM wild_life.people AS src,
                     jsonb_array_elements(src.addresses)
                         WITH ORDINALITY AS entry(value, ord)
                WHERE jsonb_array_length(src.addresses) > 0
                GROUP BY src.id
            ) AS reverted
            WHERE p.id = reverted.id
            """
        )
    )

    for column in ("unit", "city", "region", "postcode", "country"):
        op.drop_column("organizations", column, schema="wild_life")
    op.alter_column(
        "organizations", "street", new_column_name="address", schema="wild_life"
    )

    for column in _NEW:
        op.drop_column("locations", column, schema="wild_life")
    op.alter_column(
        "locations", "street", new_column_name="address", schema="wild_life"
    )
