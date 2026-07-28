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
    # Which series this belongs to. With `occurrence_at` set it is a
    # materialised occurrence standing in for one projected slot — the thing
    # iCal needs RECURRENCE-ID and a second VEVENT to say. Without it, the
    # series' anchor.
    rule_id: uuid.UUID | None = None
    occurrence_at: datetime | None = None
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
    rule_id: uuid.UUID | None = None
    occurrence_at: datetime | None = None
    links: list[MomentLinkRef] | None = None


class MomentImageRead(Entity):
    moment_id: uuid.UUID
    filename: str | None
    content_type: str | None
    sort_order: int


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
    rule_id: uuid.UUID | None
    occurrence_at: datetime | None
    links: list[MomentLinkRef] = []


class CalendarRecordRead(BaseModel):
    """A moment's shared projection — the only part of it that can leave here.

    Privacy is structural rather than a filter: a moment with no calendar record
    has nothing to export, so the question is never "did the export query say
    WHERE correctly" but "which moments were given one".
    """

    external_ref: str | None = None
    attendees: list[str] = []
    organizer: str | None = None
    sequence: int | None = None
    rsvp_status: str | None = None
    rsvp_sent_status: str | None = None
    invites_enabled: bool = False
    recurrence: str | None = None
    recurrence_exdates: list[str] = []
    cancelled_at: datetime | None = None

    model_config = {"from_attributes": True}


class CalendarRecordUpdate(BaseModel):
    """What may be changed about a moment's shared projection.

    Deliberately small. The meeting itself — title, when, body — is the moment's
    and is edited there; this is only what other people have been told, plus the
    two switches that decide whether anything leaves at all.
    """

    attendees: list[str] | None = None
    invites_enabled: bool | None = None
    cancelled_at: datetime | None = None
    location: str | None = None
    organizer: str | None = None


class Occurrence(BaseModel):
    """One thing on the calendar, however it came to be there.

    Three sources reach this one shape, which is the whole point of the read
    path: a plain moment, a wire rule we could not translate and so expand as we
    were given it, and a rule of our own projected forward. A client should not
    have to know which — and before this it did, because it expanded RRULEs
    itself.
    """

    # A stored row, when there is one. Null for a projection nothing has happened
    # to yet: those are not rows, and inventing an id for one would be inventing
    # the row (decision 10).
    moment_id: uuid.UUID | None = None
    rule_id: uuid.UUID | None = None
    # The slot this stands for — a projection's identity, and what a scoped edit
    # names. Stable across a move, unlike `start_at`.
    occurrence_at: datetime
    start_at: datetime
    end_at: datetime | None = None
    all_day: bool = False
    title: str | None = None
    body: str = ""
    kind: MomentKind = "occasion"
    # Derived, never stored: a window that passed with nothing in it.
    withdrawn_at: datetime | None = None
    links: list[MomentLinkRef] = []
    calendar: CalendarRecordRead | None = None
