"""Routes for locations, the visits derived inside them, and where you were.

The visit endpoints are read-only on purpose — visits are derived, and the tick
owns them. The two POSTs here do not create anything either; they ask for
re-derivation, which is the only kind of write this tier accepts.
"""

import logging
from datetime import datetime, timedelta, timezone
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, Query, Request, status
from sqlalchemy import func, select, update
from sqlalchemy.ext.asyncio import AsyncSession

from wild_life import geocode
from wild_life.config import settings
from wild_life.db.session import get_session
from wild_life.geofence import invalidate_fences, rebuild_visits
from wild_life.spine import forget


from wild_life.models.locations import Location, LocationPing, LocationVisit
from wild_life.query import apply_query
from wild_life.routers.crud import crud_router
from wild_life.schemas.locations import (
    LocationCreate,
    LocationRead,
    LocationUpdate,
)
from wild_life.schemas.pings import IngestStatus, TrackPoint
from wild_life.stops import recompute_candidates
from wild_life.schemas.visits import LocationVisitRead, Presence, VisitWithLocation

logger = logging.getLogger(__name__)


async def _forget_visit_moments(session: AsyncSession, location_id: UUID) -> None:
    """A place's visits cascade when it is deleted; their moments must not stay.

    The cascade is enforced by the database, so nothing in Python sees the visit
    rows go. Without this the timeline keeps a stretch of time spent somewhere
    that no longer exists, and the mirror's own test — no derived visit outlives
    its source — starts failing on live data.
    """
    ids = (
        (
            await session.execute(
                select(LocationVisit.id).where(LocationVisit.location_id == location_id)
            )
        )
        .scalars()
        .all()
    )
    await forget(session, *[f"location_visit:{i}" for i in ids])


# A visit list is small, but "small" is a property of the data rather than of the
# endpoint — the generic factory applies no limit when the caller passes none, so
# these hand-rolled routes cap themselves.
DEFAULT_LIMIT = 200
MAX_LIMIT = 500
# A day of readings is a few hundred; this is headroom, not an expectation.
TRACK_LIMIT = 5_000

router = APIRouter()

router.include_router(
    crud_router(
        prefix="/locations",
        tag="locations",
        model=Location,
        create_schema=LocationCreate,
        read_schema=LocationRead,
        update_schema=LocationUpdate,
        on_delete=_forget_visit_moments,
        order_by=Location.name,
    )
)

visits = APIRouter(prefix="/location-visits", tags=["locations"])
nested = APIRouter(prefix="/locations", tags=["locations"])


@visits.get(
    "", response_model=list[LocationVisitRead], operation_id="location_visits_list"
)
async def list_visits(
    request: Request,
    limit: int = Query(DEFAULT_LIMIT, ge=1, le=MAX_LIMIT),
    session: AsyncSession = Depends(get_session),
) -> list[LocationVisit]:
    """Derived visits, newest first. Supports the usual `field__op=` filters."""
    stmt = select(LocationVisit).order_by(LocationVisit.entered_at.desc())
    stmt, _, offset = apply_query(stmt, LocationVisit, request.query_params)
    if offset:
        stmt = stmt.offset(offset)
    rows = await session.execute(stmt.limit(limit))
    return list(rows.scalars())


@nested.get(
    "/{location_id}/visits",
    response_model=list[LocationVisitRead],
    operation_id="location_visits_for_location",
)
async def visits_for_location(
    location_id: UUID,
    limit: int = Query(DEFAULT_LIMIT, ge=1, le=MAX_LIMIT),
    session: AsyncSession = Depends(get_session),
) -> list[LocationVisit]:
    rows = await session.execute(
        select(LocationVisit)
        .where(LocationVisit.location_id == location_id)
        .order_by(LocationVisit.entered_at.desc())
        .limit(limit)
    )
    return list(rows.scalars())


@router.get(
    "/where-was-i",
    response_model=Presence,
    operation_id="where_was_i",
    tags=["locations"],
)
async def where_was_i(
    at: datetime | None = None,
    session: AsyncSession = Depends(get_session),
) -> Presence:
    """Every place containing you at one instant, most specific first.

    This is why notes, events and interactions need no ``location_id`` of their own:
    they already carry a timestamp, and a timestamp is enough. It also means a note
    written somewhere you had not yet named gets its answer retroactively, the
    moment you promote that place — which a stored foreign key could never do.
    """
    moment = at or datetime.now(timezone.utc)
    if moment.tzinfo is None:
        moment = moment.replace(tzinfo=timezone.utc)

    rows = await session.execute(
        select(LocationVisit, Location)
        .join(Location, Location.id == LocationVisit.location_id)
        .where(LocationVisit.entered_at <= moment)
        .where(
            (LocationVisit.exited_at.is_(None)) | (LocationVisit.exited_at >= moment)
        )
        .order_by(Location.radius_m.asc())
    )
    return Presence(
        at=moment,
        places=[
            VisitWithLocation(
                location_id=loc.id,
                name=loc.name,
                category=loc.category,
                radius_m=loc.radius_m,
                entered_at=visit.entered_at,
                exited_at=visit.exited_at,
                visit_id=visit.id,
            )
            for visit, loc in rows
        ],
    )


@router.get(
    "/location-pings",
    response_model=list[TrackPoint],
    operation_id="location_track",
    tags=["locations"],
)
async def location_track(
    from_: datetime | None = Query(None, alias="from"),
    to: datetime | None = Query(None),
    limit: int = Query(TRACK_LIMIT, ge=1, le=TRACK_LIMIT),
    session: AsyncSession = Depends(get_session),
) -> list[LocationPing]:
    """Raw positions over a window, for drawing a track.

    Hand-rolled rather than a `crud_router`, because the factory applies no limit
    when the caller passes none — on a table that grows by hundreds of rows a day
    that is a request to serialise the year. Defaults to the last 24 hours.
    """
    end = to or datetime.now(timezone.utc)
    start = from_ or end - timedelta(days=1)
    rows = await session.execute(
        select(LocationPing)
        .where(LocationPing.recorded_at >= start)
        .where(LocationPing.recorded_at <= end)
        .where(LocationPing.message_type == "location")
        .order_by(LocationPing.recorded_at)
        .limit(limit)
    )
    return list(rows.scalars())


@router.get(
    "/location-status",
    response_model=IngestStatus,
    operation_id="location_status",
    tags=["locations"],
)
async def location_status(
    session: AsyncSession = Depends(get_session),
) -> IngestStatus:
    """Is the tracker still reporting?

    The whole feature fails silently: the tracker is a separate app on a separate
    device, and if it stops, the map just stops growing — indistinguishable from
    staying home. This is what makes that visible.
    """
    latest = (
        await session.execute(
            select(LocationPing).order_by(LocationPing.recorded_at.desc()).limit(1)
        )
    ).scalar_one_or_none()

    day_ago = datetime.now(timezone.utc) - timedelta(days=1)
    readings_24h = await session.scalar(
        select(func.count())
        .select_from(LocationPing)
        .where(LocationPing.recorded_at >= day_ago)
    )
    total = await session.scalar(select(func.count()).select_from(LocationPing))

    lag = None
    if latest is not None:
        lag = (latest.received_at - latest.recorded_at).total_seconds()

    return IngestStatus(
        last_recorded_at=latest.recorded_at if latest else None,
        last_received_at=latest.received_at if latest else None,
        device_id=latest.device_id if latest else None,
        delivery_lag_seconds=lag,
        readings_24h=readings_24h or 0,
        total_readings=total or 0,
    )


@nested.post("/{location_id}/rebuild-visits", operation_id="location_rebuild_visits")
async def rebuild_for_location(
    location_id: UUID,
    session: AsyncSession = Depends(get_session),
) -> dict[str, int | str]:
    """Re-derive this location's whole visit history from the ping log.

    What makes a fence drawn today explain where you were last month.
    """
    location = await session.get(Location, location_id)
    if location is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, detail="Location not found")
    if location.latitude is None or location.longitude is None:
        return {"location_id": str(location_id), "visits": 0, "detail": "no fence set"}

    invalidate_fences()
    count = await rebuild_visits(
        session,
        since=datetime(1970, 1, 1, tzinfo=timezone.utc),
        only_location=location_id,
    )
    await session.execute(
        update(Location).where(Location.id == location_id).values(geo_dirty_at=None)
    )
    return {"location_id": str(location_id), "visits": count}


@nested.post(
    "/{location_id}/lookup-address",
    response_model=LocationRead,
    operation_id="location_lookup_address",
)
async def lookup_address(
    location_id: UUID,
    overwrite: bool = Query(False),
    session: AsyncSession = Depends(get_session),
) -> Location:
    """Fill in the address from the pin.

    The coordinate is the authoritative thing now — it is what readings are
    matched against — so the address is a label for it, and typing one out by
    hand is work a geocoder can do. One cached lookup, on demand only.

    By default this only fills blanks, so pressing it cannot quietly overwrite a
    correction you made. ``overwrite=true`` asks for the geocoder's version.
    """
    location = await session.get(Location, location_id)
    if location is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, detail="Location not found")
    if location.latitude is None or location.longitude is None:
        raise HTTPException(
            status.HTTP_400_BAD_REQUEST,
            detail="Place the pin first — there is no coordinate to look up",
        )

    hit = await geocode.reverse(session, location.latitude, location.longitude)
    if hit is None:
        raise HTTPException(
            status.HTTP_502_BAD_GATEWAY,
            detail="Address lookup is unavailable or returned nothing",
        )

    for field, value in geocode.to_address(hit).items():
        if value and (overwrite or not getattr(location, field)):
            setattr(location, field, value)
    return location


@nested.post("/tick", operation_id="locations_tick")
async def tick(
    full: bool = Query(False),
    session: AsyncSession = Depends(get_session),
) -> dict[str, int]:
    """Periodic upkeep: absorb backfill, and re-derive any fence that moved.

    Run from a wildpc job every 15 minutes. The rolling replay is what lets the
    live path stay simple — an offline phone flushing a day of queued fixes, or a
    fix that arrived out of order, is corrected here rather than special-cased
    during ingest.

    ``full=true`` additionally reclusters place candidates. That runs nightly
    rather than quarter-hourly because it reads months of history to answer a
    question — "where do you keep going?" — whose answer cannot change in
    fifteen minutes.
    """
    invalidate_fences()

    dirty = list(
        (
            await session.execute(
                select(Location.id).where(Location.geo_dirty_at.is_not(None))
            )
        ).scalars()
    )
    rebuilt = 0
    for location_id in dirty:
        rebuilt += await rebuild_visits(
            session,
            since=datetime(1970, 1, 1, tzinfo=timezone.utc),
            only_location=location_id,
        )
    if dirty:
        await session.execute(
            update(Location).where(Location.id.in_(dirty)).values(geo_dirty_at=None)
        )

    window = datetime.now(timezone.utc) - timedelta(hours=settings.visit_replay_hours)
    replayed = await rebuild_visits(session, since=window)

    candidates = await recompute_candidates(session) if full else 0

    return {
        "fences_rebuilt": len(dirty),
        "visits_rebuilt": rebuilt,
        "replayed": replayed,
        "candidates": candidates,
    }


router.include_router(visits)
router.include_router(nested)
