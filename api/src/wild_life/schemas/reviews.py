"""Schemas for Review."""

from datetime import date, datetime

from pydantic import BaseModel, ConfigDict

from wild_life.schemas.common import Entity, ReviewType


class ReviewCreate(BaseModel):
    review_type: ReviewType
    period_start: date | None = None
    period_end: date | None = None
    entities_reviewed: list[str] = []
    observations: str | None = None
    decisions: str | None = None
    risks: str | None = None
    follow_up_actions: str | None = None
    completed_at: datetime | None = None


class ReviewUpdate(BaseModel):
    review_type: ReviewType | None = None
    period_start: date | None = None
    period_end: date | None = None
    entities_reviewed: list[str] | None = None
    observations: str | None = None
    decisions: str | None = None
    risks: str | None = None
    follow_up_actions: str | None = None
    completed_at: datetime | None = None


class ReviewRead(Entity):
    review_type: ReviewType
    period_start: date | None
    period_end: date | None
    entities_reviewed: list[str]
    observations: str | None
    decisions: str | None
    risks: str | None
    follow_up_actions: str | None
    completed_at: datetime | None


class DashRow(BaseModel):
    """One flagged row on the review dashboard.

    Every row carries an `id`; the rest varies by section (a task row has
    priority and due_date, an area row has review_frequency), so extras pass
    through rather than being enumerated twenty times over.
    """

    model_config = ConfigDict(extra="allow")

    id: str


class ReviewDashboard(BaseModel):
    """Everything a periodic review should catch, grouped by what's wrong."""

    generated_for: date
    # The inbox, in one number. `capture` is the kind a surface writes when it
    # genuinely cannot know what you were writing — the inbox is that state, not
    # a lack — so this counts acts awaiting resolution rather than rows missing a
    # column. Kept in lockstep with `InboxPage.tsx`; `tests/test_moments.py`
    # binds the two.
    unresolved_captures_count: int
    unrooted_events_count: int
    overdue_tasks: list[DashRow]
    due_today: list[DashRow]
    stale_projects: list[DashRow]
    projects_missing_next_action: list[DashRow]
    unclear_ownership: list[DashRow]
    inactive_programs: list[DashRow]
    # Attention failure, at every altitude. Not "areas with no work in them" —
    # that was inactivity, and it could not see the case that matters: a scope
    # busy with work nobody has looked at. `days_overdue` is against the
    # effective cadence, which inherits from the nearest ancestor declaring one.
    unexamined_scopes: list[DashRow]
    # Claims nothing can ever evaluate: no metric, and no cadence anywhere above
    # them to be judged at.
    inert_objectives: list[DashRow]
    overdue_delegations: list[DashRow]
    delegation_followups: list[DashRow]
    unreviewed_deliverables: list[DashRow]
    my_inbox: list[DashRow]
    open_requests: list[DashRow]
    request_followups: list[DashRow]
    waiting_without_blocker: list[DashRow]
    delegated_without_owner: list[DashRow]
    completed_with_open_tasks: list[DashRow]
    conditions_without_protocol: list[DashRow]
    metrics_overdue: list[DashRow]
    outcomes_overdue: list[DashRow]
    low_adherence: list[DashRow]
