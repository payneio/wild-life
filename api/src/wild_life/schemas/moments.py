"""Schemas for Moment — what happened, or what you intend to happen."""

import uuid
from datetime import datetime

from pydantic import BaseModel

from wild_life.schemas.common import (
    Entity,
    EntityType,
    MomentKind,
    MomentRole,
    MomentSource,
)


class MomentLinkRef(BaseModel):
    """One thing a moment involves, and the manner of the involvement."""

    role: MomentRole
    entity_type: EntityType
    entity_id: uuid.UUID


class MomentCreate(BaseModel):
    # No default: the surface that creates a moment knows what act it is, and
    # `capture` — the one honest "I don't know yet" — is a choice a surface makes
    # deliberately rather than a value it falls back to.
    kind: MomentKind
    started_at: datetime | None = None
    ended_at: datetime | None = None
    all_day: bool = False
    window_start: datetime | None = None
    window_end: datetime | None = None
    expected_minutes: int | None = None
    title: str | None = None
    body: str = ""
    source: MomentSource = "authored"
    links: list[MomentLinkRef] = []


class MomentUpdate(BaseModel):
    kind: MomentKind | None = None
    started_at: datetime | None = None
    ended_at: datetime | None = None
    all_day: bool | None = None
    window_start: datetime | None = None
    window_end: datetime | None = None
    expected_minutes: int | None = None
    title: str | None = None
    body: str | None = None
    source: MomentSource | None = None
    # Abandoning by choice is an act and is recorded; abandoning by neglect is a
    # silence, and *that* is derived (window passed, nothing started).
    withdrawn_at: datetime | None = None
    withdrawal_reason: str | None = None
    links: list[MomentLinkRef] | None = None


class MomentRead(Entity):
    kind: MomentKind
    started_at: datetime | None
    ended_at: datetime | None
    all_day: bool
    window_start: datetime | None
    window_end: datetime | None
    expected_minutes: int | None
    title: str | None
    body: str
    source: MomentSource
    withdrawn_at: datetime | None
    withdrawal_reason: str | None
    source_ref: str | None
    links: list[MomentLinkRef] = []
