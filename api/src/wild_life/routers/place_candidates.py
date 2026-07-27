"""Routes for place candidates: review, promote, dismiss.

Promoting is the heart of the whole feature. Everything upstream — the readings,
the stop detection, the clustering — exists so that this one gesture can turn
somewhere you evidently keep going into somewhere the app knows about, and then
explain your history with it retroactively.
"""

import logging
from datetime import datetime, timezone
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from wild_life import geocode
from wild_life.config import settings
from wild_life.db.session import get_session
from wild_life.geofence import invalidate_fences, rebuild_visits
from wild_life.models.locations import Location, PlaceCandidate
from wild_life.schemas.candidates import (
    PlaceCandidateRead,
    PromoteRequest,
    PromoteResult,
)
from wild_life.schemas.locations import LocationRead

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/place-candidates", tags=["locations"])

# A fence narrower than this is smaller than the noise in a phone's fixes, so it
# would fail to match the very readings that proposed it.
MIN_PROMOTED_RADIUS_M = 75


@router.get(
    "", response_model=list[PlaceCandidateRead], operation_id="place_candidates_list"
)
async def list_candidates(
    include_decided: bool = Query(False),
    limit: int = Query(50, ge=1, le=200),
    session: AsyncSession = Depends(get_session),
) -> list[PlaceCandidate]:
    """The review queue: undecided proposals, most dwelt-in first.

    Thresholded so a place you stopped at once does not demand a decision — it
    stays in the table and surfaces if it becomes a habit.
    """
    stmt = select(PlaceCandidate)
    if not include_decided:
        stmt = (
            stmt.where(PlaceCandidate.dismissed_at.is_(None))
            .where(PlaceCandidate.promoted_location_id.is_(None))
            .where(
                (PlaceCandidate.stop_count >= settings.candidate_min_stops)
                | (PlaceCandidate.total_seconds >= settings.candidate_min_seconds)
            )
        )
    rows = await session.execute(
        stmt.order_by(PlaceCandidate.total_seconds.desc()).limit(limit)
    )
    return list(rows.scalars())


@router.post(
    "/{candidate_id}/promote",
    response_model=PromoteResult,
    operation_id="place_candidate_promote",
)
async def promote(
    candidate_id: UUID,
    body: PromoteRequest | None = None,
    session: AsyncSession = Depends(get_session),
) -> PromoteResult:
    """Turn a proposal into a Location, and backfill everything it explains."""
    candidate = await session.get(PlaceCandidate, candidate_id)
    if candidate is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, detail="Candidate not found")
    if candidate.promoted_location_id is not None:
        raise HTTPException(status.HTTP_409_CONFLICT, detail="Already promoted")

    overrides = body or PromoteRequest()

    # One lookup, cached forever, and never allowed to fail the promote: you are
    # looking at the map and can type a name faster than we can apologise.
    hit = await geocode.reverse(session, candidate.centroid_lat, candidate.centroid_lon)

    location = Location(
        name=overrides.name or (hit.name if hit else None) or "Unnamed place",
        category=overrides.category,
        latitude=candidate.centroid_lat,
        longitude=candidate.centroid_lon,
        radius_m=overrides.radius_m or max(candidate.radius_m, MIN_PROMOTED_RADIUS_M),
        # Every component the lookup returned — including the postcode and country
        # that the old three-field address had nowhere to put and silently dropped.
        **geocode.to_address(hit),
    )
    session.add(location)
    await session.flush()

    candidate.promoted_location_id = location.id
    if hit is not None and hit.name:
        candidate.label_hint = hit.name

    # The payoff: the fence explains the stops that proposed it. Bounded by the
    # candidate's own history, so this stays cheap.
    invalidate_fences()
    visits = await rebuild_visits(
        session, since=candidate.first_seen_at, only_location=location.id
    )
    location.geo_dirty_at = None

    await session.flush()
    await session.refresh(location)
    return PromoteResult(
        location=LocationRead.model_validate(location),
        visits=visits,
        geocoded=hit is not None,
    )


@router.post(
    "/{candidate_id}/dismiss",
    response_model=PlaceCandidateRead,
    operation_id="place_candidate_dismiss",
)
async def dismiss(
    candidate_id: UUID, session: AsyncSession = Depends(get_session)
) -> PlaceCandidate:
    """Not a place. The recompute honours this rather than re-proposing it."""
    candidate = await session.get(PlaceCandidate, candidate_id)
    if candidate is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, detail="Candidate not found")
    candidate.dismissed_at = datetime.now(timezone.utc)
    return candidate
