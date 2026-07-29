"""deliverable restated its root

`OutcomeKind` loses `deliverable`, and its two rows become what they actually
are.

The measurement: **every deliverable was on a project and every project outcome
was a deliverable** — 2 of 2, with the registry's "Done when" panel defaulting
the kind by rung, so the app manufactured the correlation itself. That is the
`note_type` failure exactly: journal meant "about me", meeting meant "about an
event", and deliverable meant "about a project". A facet that restates its root
carries nothing.

And the rows were never deliverables. One reads "This is an open-ended project
with no end state" — the explicit *absence* of a completion criterion — and the
other is an observation about why a project ended, on a project already archived.
`satisfied_at` is null on both, so the single field that distinguished the kind
was never used, and nothing else in the model uses the idea either: 0 tasks with
`acceptance_required`, 0 commitments with `acceptance_status`.

So the panel did not record deliverables, it produced them: it asked a question
on every project and got prose about the project back, because before every
record carried a Log there was nowhere else for that prose to go. The same shape
as `medications.notes` holding four dated events, and `mood` arriving from an
import — a field that exists gets filled with whatever is nearby.

Both become `observation` moments on their projects, which is where prose about a
project belongs. A project's completion is its tasks and its status; tasks are
what define when things get done.

`standard` and `target` survive the same test: `target` is the only kind that
varies within a rung (a program has 5 of each), so it says something the root
does not.

Revision ID: b68e54dddfe5
Revises: 1d4e71342134
"""

from collections.abc import Sequence

from alembic import op

revision: str = "b68e54dddfe5"
down_revision: str | None = "1d4e71342134"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None

SCHEMA = "wild_life"


def upgrade() -> None:
    # The statement becomes the body: it is prose, and prose about a project is
    # an observation on it. `source_ref` keeps this idempotent and names where it
    # came from, exactly as every other migrated row does.
    op.execute(f"""
        INSERT INTO {SCHEMA}.moments
            (kind, started_at, all_day, title, body, source, source_ref)
        SELECT 'observation', o.created_at, true, NULL, o.statement,
               'authored', 'outcome:' || o.id
        FROM {SCHEMA}.outcomes o
        WHERE o.kind = 'deliverable'
        ON CONFLICT (source_ref) DO NOTHING
    """)
    op.execute(f"""
        INSERT INTO {SCHEMA}.moment_links (moment_id, role, entity_type, entity_id)
        SELECT m.id, 'subject', o.entity_type, o.entity_id
        FROM {SCHEMA}.outcomes o
        JOIN {SCHEMA}.moments m ON m.source_ref = 'outcome:' || o.id
        WHERE o.kind = 'deliverable' AND o.entity_type IS NOT NULL
        ON CONFLICT ON CONSTRAINT uq_moment_links_edge DO NOTHING
    """)
    op.execute(f"DELETE FROM {SCHEMA}.outcomes WHERE kind = 'deliverable'")


def downgrade() -> None:
    # The outcomes are gone; the moments carrying their prose are not, and are
    # the better record. Naming that rather than pretending to restore them.
    op.execute(
        f"DELETE FROM {SCHEMA}.moments WHERE source_ref LIKE 'outcome:%' "
        f"AND kind = 'observation'"
    )
