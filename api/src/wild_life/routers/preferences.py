"""Preferences — a tiny GET/PUT surface over the generic Preference KV store.

Currently backs the calendar/invite settings; the store is generic so future
settings reuse the same two endpoints.
"""

from __future__ import annotations

from fastapi import APIRouter, Depends
from sqlalchemy.dialects.postgresql import insert as pg_insert
from sqlalchemy.ext.asyncio import AsyncSession

from wild_life.db.session import get_session
from wild_life.models.preferences import Preference
from wild_life.schemas.preferences import CalendarPrefs, PreferenceRead

router = APIRouter(prefix="/preferences", tags=["preferences"])


async def load_calendar_prefs(session: AsyncSession) -> CalendarPrefs:
    """The calendar prefs, or defaults when unset. Tolerant of stale keys."""
    pref = await session.get(Preference, "calendar")
    if pref is None:
        return CalendarPrefs()
    return CalendarPrefs.model_validate(pref.value or {})


@router.get("/{key}", response_model=PreferenceRead, operation_id="preferences_get")
async def get_preference(
    key: str, session: AsyncSession = Depends(get_session)
) -> PreferenceRead:
    pref = await session.get(Preference, key)
    if pref is None:
        # Return defaults for known keys so the UI always has something to bind.
        value = CalendarPrefs().model_dump() if key == "calendar" else {}
        return PreferenceRead(key=key, value=value)
    return PreferenceRead(key=key, value=pref.value or {})


@router.put("/{key}", response_model=PreferenceRead, operation_id="preferences_set")
async def set_preference(
    key: str,
    value: dict,
    session: AsyncSession = Depends(get_session),
) -> PreferenceRead:
    # Validate known keys against their schema so bad data never lands.
    if key == "calendar":
        value = CalendarPrefs.model_validate(value).model_dump()
    stmt = (
        pg_insert(Preference)
        .values(key=key, value=value)
        .on_conflict_do_update(index_elements=["key"], set_={"value": value})
        .returning(Preference)
    )
    pref = (await session.execute(stmt)).scalar_one()
    return PreferenceRead(key=pref.key, value=pref.value or {})
