"""Schemas for Outcome."""

import uuid
from datetime import date, datetime

from pydantic import BaseModel

from wild_life.schemas.common import EndingCause, Entity, EntityType, OutcomeKind, OutcomeStatus


class OutcomeCreate(BaseModel):
    statement: str
    kind: OutcomeKind
    entity_type: EntityType
    entity_id: uuid.UUID
    description: str | None = None
    status: OutcomeStatus = "active"
    metric_id: uuid.UUID | None = None
    target_min: float | None = None
    target_max: float | None = None
    baseline: float | None = None
    by_when: date | None = None
    satisfied_at: datetime | None = None
    ending_cause: EndingCause | None = None
    ending_note: str | None = None


class OutcomeUpdate(BaseModel):
    statement: str | None = None
    kind: OutcomeKind | None = None
    entity_type: EntityType | None = None
    entity_id: uuid.UUID | None = None
    description: str | None = None
    status: OutcomeStatus | None = None
    metric_id: uuid.UUID | None = None
    target_min: float | None = None
    target_max: float | None = None
    baseline: float | None = None
    by_when: date | None = None
    satisfied_at: datetime | None = None
    ending_cause: EndingCause | None = None
    ending_note: str | None = None


class OutcomeRead(Entity):
    statement: str
    kind: OutcomeKind
    entity_type: EntityType
    entity_id: uuid.UUID
    description: str | None
    status: OutcomeStatus
    metric_id: uuid.UUID | None
    target_min: float | None
    target_max: float | None
    baseline: float | None
    by_when: date | None
    satisfied_at: datetime | None
    ending_cause: EndingCause | None
    ending_note: str | None


class Evaluation(BaseModel):
    """Where an outcome actually stands, and the parts that say why.

    `state` is the headline; everything else is returned so a surface can show its
    reasoning rather than an unexplained percentage. Nothing here is stored — an
    outcome's `status` says whether the claim is live, never whether it is met.
    """

    state: str
    # The reading the verdict rests on.
    latest_value: float | None
    latest_at: datetime | None
    is_stale: bool
    # The bands: mine, then the world's.
    target_min: float | None
    target_max: float | None
    reference_min: float | None
    reference_max: float | None
    # `target` kind only.
    progress: float | None
    baseline: float | None
    days_remaining: int | None
    pace_required: float | None
    pace_actual: float | None
    # How much work claims to be moving this.
    advanced_by: int


class OutcomeEvaluationCreate(BaseModel):
    """One judgement of whether a claim held.

    `evaluated_at` defaults to now; supplying it is for recording a judgement
    made at a review you are writing up afterwards.
    """

    evaluated_at: datetime | None = None
    #: Null means "looked, could not tell" — kept apart from "no" on purpose.
    holds: bool | None = None
    note: str | None = None


class OutcomeEvaluationRead(Entity):
    outcome_id: uuid.UUID
    evaluated_at: datetime
    holds: bool | None
    note: str | None
