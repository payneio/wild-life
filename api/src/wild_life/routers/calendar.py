"""Calendar routes: events + recurrence-aware scoped edit/delete.

The generic CRUD covers single events. Recurring events need Google-Calendar-style
scoped operations — **This occurrence / This and following / All events** — which
are multi-row and must be transactional, so they live in bespoke routes here.

Model: a recurring master carries the RRULE; a modified single occurrence is a
separate row linked by `recurrence_parent_id` with `recurrence_id` = the original
occurrence it replaces, and the master lists that date in `recurrence_exdates` so
it isn't double-rendered.
"""

from __future__ import annotations

from datetime import UTC, datetime, timedelta
from typing import Any, Literal
from uuid import UUID

from fastapi import Depends, HTTPException, status
from pydantic import BaseModel
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from wild_life.db.session import get_session
from wild_life.models.calendar import Event
from wild_life.routers.crud import crud_router
from wild_life.schemas.calendar import EventCreate, EventRead, EventUpdate

router = crud_router(
    prefix="/events",
    tag="calendar",
    model=Event,
    create_schema=EventCreate,
    read_schema=EventRead,
    update_schema=EventUpdate,
    order_by=Event.start_at,
)

Scope = Literal["this", "following", "all"]

# Fields an occurrence edit may carry that are NOT time (applied verbatim to the
# target row regardless of scope). Time changes (start_at/end_at) are handled
# specially so "all" shifts the series by the drag delta.
_CONTENT_FIELDS = (
    "title",
    "description",
    "location",
    "all_day",
    "attendees",
    "area_id",
    "program_id",
    "project_id",
    "notes",
)


class OccurrenceEdit(BaseModel):
    scope: Scope
    # The original start of the occurrence being acted on (identifies which one).
    occurrence_date: datetime
    # Desired absolute field values for that occurrence (start_at is the new
    # absolute start; the server derives the series delta from it for "all").
    changes: EventUpdate = EventUpdate()


def _rrule_set_until(rrule: str, until: datetime) -> str:
    """Return the RRULE with UNTIL set to `until` (UTC), dropping COUNT/old UNTIL."""
    parts = [
        p
        for p in rrule.split(";")
        if p and not p.upper().startswith(("UNTIL=", "COUNT="))
    ]
    stamp = until.astimezone(UTC).strftime("%Y%m%dT%H%M%SZ")
    parts.append(f"UNTIL={stamp}")
    return ";".join(parts)


async def _load_master(session: AsyncSession, event_id: UUID) -> Event:
    obj = await session.get(Event, event_id)
    if obj is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, detail="Not found")
    if obj.recurrence_parent_id is not None:
        parent = await session.get(Event, obj.recurrence_parent_id)
        if parent is not None:
            return parent
    return obj


def _duration(master: Event) -> timedelta | None:
    if master.end_at and master.start_at:
        return master.end_at - master.start_at
    return None


def _apply_content(obj: Event, changes: EventUpdate) -> None:
    data = changes.model_dump(exclude_unset=True)
    for f in _CONTENT_FIELDS:
        if f in data:
            setattr(obj, f, data[f])


def _iso(dt: datetime) -> str:
    return dt.isoformat()


@router.patch("/{event_id}/occurrence", response_model=EventRead)
async def edit_occurrence(
    event_id: UUID,
    payload: OccurrenceEdit,
    session: AsyncSession = Depends(get_session),
) -> Any:
    """Scoped edit of a recurring event. Returns the row that now represents the
    edited occurrence/series."""
    master = await _load_master(session, event_id)
    occ = payload.occurrence_date
    changes = payload.changes
    new_start = changes.start_at
    delta = (new_start - occ) if new_start else timedelta(0)

    # Non-recurring event → nothing to scope; behave like a plain patch.
    if not master.recurrence:
        _apply_content(master, changes)
        if new_start:
            master.start_at = new_start
            if changes.end_at is not None:
                master.end_at = changes.end_at
        await session.flush()
        await session.refresh(master)
        return master

    if payload.scope == "all":
        _apply_content(master, changes)
        if delta:
            master.start_at = master.start_at + delta
            if master.end_at:
                master.end_at = master.end_at + delta
        await session.flush()
        await session.refresh(master)
        return master

    if payload.scope == "this":
        # Exclude the occurrence from the master, then upsert a linked override.
        exdates = list(master.recurrence_exdates or [])
        if _iso(occ) not in exdates:
            exdates.append(_iso(occ))
            master.recurrence_exdates = exdates
        existing = (
            await session.execute(
                select(Event).where(
                    Event.recurrence_parent_id == master.id,
                    Event.recurrence_id == occ,
                )
            )
        ).scalar_one_or_none()
        dur = _duration(master)
        start = new_start or occ
        override = existing or Event(
            recurrence_parent_id=master.id,
            recurrence_id=occ,
            title=master.title,
            start_at=start,
        )
        override.start_at = start
        if changes.end_at is not None:
            override.end_at = changes.end_at
        elif override.end_at is None:
            override.end_at = (start + dur) if dur else None
        # Seed content from master on first creation, then apply changes.
        if existing is None:
            override.description = master.description
            override.location = master.location
            override.all_day = master.all_day
            override.attendees = list(master.attendees or [])
            override.area_id = master.area_id
            override.program_id = master.program_id
            override.project_id = master.project_id
        _apply_content(override, changes)
        override.recurrence = None
        if existing is None:
            session.add(override)
        await session.flush()
        await session.refresh(override)
        return override

    # scope == "following": split the series at the occurrence.
    orig_rule = master.recurrence  # the rule the new (later) series inherits
    dur = _duration(master)
    master.recurrence = _rrule_set_until(orig_rule, occ - timedelta(seconds=1))
    # Move exdates at/after the split onto the new series.
    keep, moved = [], []
    for ex in master.recurrence_exdates or []:
        (moved if ex >= _iso(occ) else keep).append(ex)
    master.recurrence_exdates = keep

    split_start = new_start or occ
    new_master = Event(
        title=master.title,
        description=master.description,
        location=master.location,
        start_at=split_start,
        end_at=(split_start + dur) if dur else None,
        all_day=master.all_day,
        attendees=list(master.attendees or []),
        recurrence=orig_rule,
        recurrence_exdates=moved,
        area_id=master.area_id,
        program_id=master.program_id,
        project_id=master.project_id,
    )
    _apply_content(new_master, changes)
    session.add(new_master)
    await session.flush()

    # Re-parent overrides at/after the split to the new master.
    later = (
        (
            await session.execute(
                select(Event).where(
                    Event.recurrence_parent_id == master.id,
                    Event.recurrence_id >= occ,
                )
            )
        )
        .scalars()
        .all()
    )
    for ov in later:
        ov.recurrence_parent_id = new_master.id
    await session.flush()
    await session.refresh(new_master)
    return new_master


@router.delete("/{event_id}/occurrence", status_code=status.HTTP_204_NO_CONTENT)
async def delete_occurrence(
    event_id: UUID,
    scope: Scope,
    occurrence_date: datetime,
    session: AsyncSession = Depends(get_session),
) -> None:
    master = await _load_master(session, event_id)

    if scope == "all" or not master.recurrence:
        await session.delete(master)
        return

    if scope == "this":
        exdates = list(master.recurrence_exdates or [])
        if _iso(occurrence_date) not in exdates:
            exdates.append(_iso(occurrence_date))
            master.recurrence_exdates = exdates
        override = (
            await session.execute(
                select(Event).where(
                    Event.recurrence_parent_id == master.id,
                    Event.recurrence_id == occurrence_date,
                )
            )
        ).scalar_one_or_none()
        if override is not None:
            await session.delete(override)
        return

    # scope == "following"
    master.recurrence = _rrule_set_until(
        master.recurrence, occurrence_date - timedelta(seconds=1)
    )
    master.recurrence_exdates = [
        ex for ex in (master.recurrence_exdates or []) if ex < _iso(occurrence_date)
    ]
    later = (
        (
            await session.execute(
                select(Event).where(
                    Event.recurrence_parent_id == master.id,
                    Event.recurrence_id >= occurrence_date,
                )
            )
        )
        .scalars()
        .all()
    )
    for ov in later:
        await session.delete(ov)
