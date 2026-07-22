"""Schemas for Review."""

from datetime import date, datetime

from pydantic import BaseModel

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
    notes: str | None = None


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
    notes: str | None = None


class ReviewRead(Entity):
    review_type: str
    period_start: date | None
    period_end: date | None
    entities_reviewed: list[str]
    observations: str | None
    decisions: str | None
    risks: str | None
    follow_up_actions: str | None
    completed_at: datetime | None
    notes: str | None
