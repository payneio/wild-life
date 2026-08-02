"""The plan-to-outcome relation becomes data.

`docs/model.md` A4 and A9. Both relations already existed; neither was
representable. Asking whether a commitment happened meant transforming a string
— `replace(source_ref, ':work', ':completion')` — because the only thing tying a
task's intention to its completion was that the mirror had named them similarly.
A relation carried by a naming convention cannot be indexed, cannot be
constrained, and is silently wrong the moment anything renames.

`intention_moments` carries `discharges` and `generates`, M:N in both
directions. The cardinality is the point: one Saturday errand discharges three
commitments, and one meeting generates two, neither of which a single row could
hold. It is exactly what the old model could not say.

`task_objectives` carries means-end. Contribution is not satisfaction, so this
answers "what is left before X" and nothing about whether X is true.

**The backfill converts the convention into the relation.** Every moment named
`task:<id>:completion` is that task's discharge, and every `<entity>:<id>:<kind>`
finish is its row's — so the edges the string was standing in for are written
once, here, and the string stops being load-bearing.

Revision ID: e5d4c3b2a1f0
Revises: c9d8e7f6a5b4
"""

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op

revision: str = "e5d4c3b2a1f0"
down_revision: str | None = "c9d8e7f6a5b4"
branch_labels: Sequence[str] | None = None
depends_on: Sequence[str] | None = None


def upgrade() -> None:
    op.create_table(
        "intention_moments",
        sa.Column(
            "id",
            sa.UUID(),
            primary_key=True,
            server_default=sa.text("gen_random_uuid()"),
        ),
        sa.Column("intention_type", sa.Text(), nullable=False),
        sa.Column("intention_id", sa.UUID(), nullable=False),
        sa.Column(
            "moment_id",
            sa.UUID(),
            sa.ForeignKey("wild_life.moments.id", ondelete="CASCADE"),
            nullable=False,
        ),
        sa.Column("role", sa.Text(), nullable=False),
        sa.Column(
            "created_at", sa.DateTime(timezone=True), server_default=sa.text("now()")
        ),
        sa.Column(
            "updated_at", sa.DateTime(timezone=True), server_default=sa.text("now()")
        ),
        sa.UniqueConstraint(
            "intention_type",
            "intention_id",
            "moment_id",
            "role",
            name="uq_intention_moment_edge",
        ),
        schema="wild_life",
    )
    op.create_index(
        "ix_intention_moments_intention",
        "intention_moments",
        ["intention_type", "intention_id"],
        schema="wild_life",
    )
    op.create_index(
        "ix_intention_moments_moment",
        "intention_moments",
        ["moment_id"],
        schema="wild_life",
    )

    op.create_table(
        "task_objectives",
        sa.Column(
            "id",
            sa.UUID(),
            primary_key=True,
            server_default=sa.text("gen_random_uuid()"),
        ),
        sa.Column(
            "task_id",
            sa.UUID(),
            sa.ForeignKey("wild_life.tasks.id", ondelete="CASCADE"),
            nullable=False,
        ),
        sa.Column(
            "outcome_id",
            sa.UUID(),
            sa.ForeignKey("wild_life.outcomes.id", ondelete="CASCADE"),
            nullable=False,
        ),
        sa.Column(
            "created_at", sa.DateTime(timezone=True), server_default=sa.text("now()")
        ),
        sa.Column(
            "updated_at", sa.DateTime(timezone=True), server_default=sa.text("now()")
        ),
        sa.UniqueConstraint("task_id", "outcome_id", name="uq_task_objective"),
        schema="wild_life",
    )
    op.create_index(
        "ix_task_objectives_outcome",
        "task_objectives",
        ["outcome_id"],
        schema="wild_life",
    )

    # The convention, made into the relation it was standing in for. A moment
    # named `<entity>:<id>:<kind>` was derived from that row's finishing, which
    # is precisely a discharge.
    op.execute("""
        INSERT INTO wild_life.intention_moments
            (intention_type, intention_id, moment_id, role)
        SELECT split_part(m.source_ref, ':', 1),
               split_part(m.source_ref, ':', 2)::uuid,
               m.id,
               'discharges'
          FROM wild_life.moments m
         WHERE m.source_ref ~ '^(task|outcome|request|review|decision):[0-9a-f-]+:'
           AND split_part(m.source_ref, ':', 3) IN ('completion', 'decision')
           AND (
                (split_part(m.source_ref, ':', 1) = 'task'
                 AND EXISTS (SELECT 1 FROM wild_life.tasks t
                              WHERE t.id = split_part(m.source_ref, ':', 2)::uuid))
             OR (split_part(m.source_ref, ':', 1) = 'outcome'
                 AND EXISTS (SELECT 1 FROM wild_life.outcomes o
                              WHERE o.id = split_part(m.source_ref, ':', 2)::uuid))
           )
        ON CONFLICT ON CONSTRAINT uq_intention_moment_edge DO NOTHING
    """)


def downgrade() -> None:
    op.drop_table("task_objectives", schema="wild_life")
    op.drop_table("intention_moments", schema="wild_life")
