"""Turning position fixes into visits.

The load-bearing idea in this module: **replay is the authority.** :func:`derive_visits`
is a pure function of (fixes, fences) and *is* the definition of a visit. Everything
else here either feeds it or caches its result.

:func:`evaluate_ping` — the live path that runs as each ping arrives — is only a
latency optimisation. It is allowed to be approximately right, because the tick
re-derives a rolling window and overwrites whatever it concluded. That single choice
is what makes eight otherwise-separate problems the same problem: out-of-order
timestamps, an offline phone flushing its queue, clock skew, duplicate delivery, a
restart mid-visit, a radius edited after the fact, a Location added retroactively,
and a candidate promoted into one. All of them are "re-run the window."

``tests/test_geofence.py`` asserts the two paths agree, which is the only reason the
fast path is allowed to exist.

Known limitation: fixes from every device are folded into one stream, because the
person is in one place and a second device is noise rather than a second subject.
That is right for one phone and wrong for two — a tablet left at home interleaved
with a phone at work would look like someone teleporting, and the hysteresis here is
sized for jitter, not for that. If a second tracker ever appears, this is the thing
to revisit.
"""

import uuid
from collections.abc import Sequence
from dataclasses import dataclass, field
from datetime import datetime, timedelta, timezone

from sqlalchemy import delete, func, select
from sqlalchemy.ext.asyncio import AsyncSession

from wild_life.config import settings
from wild_life.geo import beyond_latitude_band, encloses, fit_score, haversine_m
from wild_life.models.locations import Location, LocationPing, LocationVisit


@dataclass(frozen=True)
class Fence:
    """A location with an active geofence."""

    id: uuid.UUID
    latitude: float
    longitude: float
    radius_m: float


@dataclass(frozen=True)
class Fix:
    """The part of a ping the state machine cares about."""

    id: int | None
    recorded_at: datetime
    latitude: float
    longitude: float
    accuracy_m: float | None


@dataclass
class DerivedVisit:
    """One visit as the derivation sees it, before it becomes a row."""

    location_id: uuid.UUID
    entered_at: datetime
    last_seen_inside_at: datetime
    exited_at: datetime | None = None
    close_reason: str | None = None
    ping_count: int = 0
    pending_exit_count: int = 0
    first_ping_id: int | None = None
    last_ping_id: int | None = None

    def as_row(self) -> dict[str, object]:
        return {
            "location_id": self.location_id,
            "entered_at": self.entered_at,
            "exited_at": self.exited_at,
            "last_seen_inside_at": self.last_seen_inside_at,
            "pending_exit_count": self.pending_exit_count,
            "ping_count": self.ping_count,
            "first_ping_id": self.first_ping_id,
            "last_ping_id": self.last_ping_id,
            "close_reason": self.close_reason,
            "source": "derived",
        }


@dataclass
class _Cache:
    loaded_at: datetime | None = None
    fences: list[Fence] = field(default_factory=list)


_cache = _Cache()


def invalidate_fences() -> None:
    """Drop the cached fence list. Called after a fence is edited, and by tests."""
    _cache.loaded_at = None
    _cache.fences = []


async def load_fences(session: AsyncSession, *, fresh: bool = False) -> list[Fence]:
    """Every location with an active fence.

    Cached briefly rather than subscribed to: the API is the producer of change
    notifications, so listening to its own stream would be new machinery to save a
    query over a few dozen rows. A stale fence self-corrects within
    ``fence_cache_seconds``, and history is re-derived regardless.
    """
    now = datetime.now(timezone.utc)
    if (
        not fresh
        and _cache.loaded_at is not None
        and (now - _cache.loaded_at).total_seconds() < settings.fence_cache_seconds
    ):
        return _cache.fences

    rows = await session.execute(
        select(Location.id, Location.latitude, Location.longitude, Location.radius_m)
        .where(Location.latitude.is_not(None))
        .where(Location.longitude.is_not(None))
    )
    _cache.fences = [
        Fence(id=r.id, latitude=r.latitude, longitude=r.longitude, radius_m=r.radius_m)
        for r in rows
    ]
    _cache.loaded_at = now
    return _cache.fences


def _fit(fix: Fix, fence: Fence, accuracy: float) -> tuple[float, float]:
    """(score, distance) for one fix against one fence."""
    if beyond_latitude_band(
        fix.latitude,
        fence.latitude,
        fence.radius_m + settings.snap_max_slack_m,
    ):
        # Latitude alone already puts it out of reach; skip the trig.
        return 0.0, float("inf")
    distance = haversine_m(fix.latitude, fix.longitude, fence.latitude, fence.longitude)
    score = fit_score(
        distance,
        fence.radius_m,
        accuracy,
        sigma_floor_m=settings.snap_sigma_floor_m,
        max_slack_sigma=settings.snap_max_slack_sigma,
        max_slack_m=settings.snap_max_slack_m,
    )
    return score, distance


def places_for(
    fix: Fix, fences: Sequence[Fence], accuracy: float
) -> tuple[dict[uuid.UUID, float], dict[uuid.UUID, float]]:
    """Which fences this fix belongs to, and how far it is from each.

    Not an independent test per fence, because "which of these two bars am I at"
    and "which regions contain me" are different questions. A fence is credited
    unless a *rival* scores clearly better — and a rival means a fence that
    neither encloses it nor is enclosed by it. Nesting therefore survives
    untouched (you really are in the city, the neighbourhood and the bar), while
    genuine alternatives resolve to one winner.

    A fix that fits nothing well enough returns nothing, which is the honest
    answer and the one that feeds place discovery: snapping everything to the
    nearest known place is exactly how you would never find a new one.
    """
    scores: dict[uuid.UUID, float] = {}
    distances: dict[uuid.UUID, float] = {}
    plausible: list[Fence] = []
    for fence in fences:
        score, distance = _fit(fix, fence, accuracy)
        distances[fence.id] = distance
        if score > 0:
            scores[fence.id] = score
            plausible.append(fence)

    accepted: dict[uuid.UUID, float] = {}
    for fence in plausible:
        rivals = [
            rival.id
            for rival in plausible
            if rival.id != fence.id
            and not encloses(
                rival.latitude,
                rival.longitude,
                rival.radius_m,
                fence.latitude,
                fence.longitude,
                fence.radius_m,
            )
            and not encloses(
                fence.latitude,
                fence.longitude,
                fence.radius_m,
                rival.latitude,
                rival.longitude,
                rival.radius_m,
            )
        ]
        # A fence must *win* its rivalry, not merely survive it. Requiring only
        # that nothing beat it would credit both of two equally-good candidates,
        # putting you in two bars at once — which is the very thing having rivals
        # is meant to prevent. With no rivals the bar is zero and it is accepted.
        best_rival = max((scores[r] for r in rivals), default=0.0)
        if scores[fence.id] >= settings.snap_margin * best_rival:
            accepted[fence.id] = scores[fence.id]
    return accepted, distances


def derive_visits(
    fixes: Sequence[Fix],
    fences: Sequence[Fence],
    *,
    carry: Sequence[DerivedVisit] = (),
) -> list[DerivedVisit]:
    """**The definition of a visit.** Pure; the same input always gives the same output.

    ``carry`` seeds the machine with visits already open before this window began,
    so a replay over a slice does not amputate a visit that started earlier.

    Fixes must be ordered by ``recorded_at``.
    """
    stale = timedelta(seconds=settings.visit_stale_seconds)
    minimum = timedelta(seconds=settings.min_visit_seconds)
    open_visits: dict[uuid.UUID, DerivedVisit] = {v.location_id: v for v in carry}
    closed: list[DerivedVisit] = []

    def close(visit: DerivedVisit, at: datetime, reason: str) -> None:
        visit.exited_at = at
        visit.close_reason = reason
        # Too brief to have been anywhere. Dropped at close time rather than
        # filtered on read, so a replay and the live path agree on what exists.
        if at - visit.entered_at >= minimum:
            closed.append(visit)

    for fix in fixes:
        # A phone that dies looks exactly like sitting still, so a visit with no
        # confirming fix for long enough is closed as `stale` rather than believed.
        for location_id, visit in list(open_visits.items()):
            if fix.recorded_at - visit.last_seen_inside_at > stale:
                close(visit, visit.last_seen_inside_at, "stale")
                del open_visits[location_id]

        accuracy = fix.accuracy_m
        if accuracy is None or accuracy > settings.geofence_max_accuracy_m:
            continue  # stored, but it asserts nothing

        accepted, distances = places_for(fix, fences, accuracy)

        for fence in fences:
            visit = open_visits.get(fence.id)
            if fence.id in accepted:
                if visit is None:
                    open_visits[fence.id] = DerivedVisit(
                        location_id=fence.id,
                        entered_at=fix.recorded_at,
                        last_seen_inside_at=fix.recorded_at,
                        ping_count=1,
                        first_ping_id=fix.id,
                        last_ping_id=fix.id,
                    )
                else:
                    visit.last_seen_inside_at = fix.recorded_at
                    visit.last_ping_id = fix.id
                    visit.ping_count += 1
                    visit.pending_exit_count = 0
            elif visit is not None:
                visit.pending_exit_count += 1
                # Marginal and decisive departures deserve different treatment: a
                # fix well clear of the fence is unambiguous and waiting for a
                # second would leave the visit open across a drive away, while one
                # just past the edge needs corroborating.
                decisive = (
                    distances[fence.id]
                    > fence.radius_m * settings.geofence_hard_exit_factor
                )
                if (
                    decisive
                    or visit.pending_exit_count >= settings.geofence_exit_consecutive
                ):
                    # Stamped from the last confirmed sighting, not from the fix
                    # that proved departure: you left somewhere in between, and the
                    # last time we know you were there is the honest answer.
                    close(visit, visit.last_seen_inside_at, "exit")
                    del open_visits[fence.id]

    return closed + list(open_visits.values())


async def _fixes_between(
    session: AsyncSession, since: datetime, until: datetime
) -> list[Fix]:
    rows = await session.execute(
        select(
            LocationPing.id,
            LocationPing.recorded_at,
            LocationPing.latitude,
            LocationPing.longitude,
            LocationPing.accuracy_m,
        )
        .where(LocationPing.recorded_at >= since)
        .where(LocationPing.recorded_at <= until)
        .where(LocationPing.message_type == "location")
        .order_by(LocationPing.recorded_at)
    )
    return [
        Fix(
            id=r.id,
            recorded_at=r.recorded_at,
            latitude=r.latitude,
            longitude=r.longitude,
            accuracy_m=r.accuracy_m,
        )
        for r in rows
    ]


async def _manually_held(session: AsyncSession) -> set[uuid.UUID]:
    """Locations with a hand-entered visit currently open.

    Derivation must leave these alone. Not merely out of politeness: the partial
    unique index allows one open visit per location, so deriving a second one would
    fail the insert outright.
    """
    rows = await session.execute(
        select(LocationVisit.location_id)
        .where(LocationVisit.exited_at.is_(None))
        .where(LocationVisit.source != "derived")
    )
    return set(rows.scalars())


async def rebuild_visits(
    session: AsyncSession,
    *,
    since: datetime,
    until: datetime | None = None,
    only_location: uuid.UUID | None = None,
) -> int:
    """Re-derive visits over a window and replace whatever was there.

    Writes with Core statements so the audit listener never sees them: re-deriving
    five years of history is *one* logical change, and it would otherwise put
    thousands of rows into ``change_log`` and thousands of frames onto every open
    SSE stream. Callers announce the result themselves, once.

    Hand-entered visits (``source <> 'derived'``) are never touched — the tier rule
    is that derivation owns what it derived and nothing else.
    """
    until = until or datetime.now(timezone.utc)
    fences = await load_fences(session, fresh=True)
    if only_location is not None:
        fences = [f for f in fences if f.id == only_location]
    held = await _manually_held(session)
    fences = [f for f in fences if f.id not in held]
    if not fences:
        return 0

    fence_ids = [f.id for f in fences]

    # A visit still open when the window began is re-derived whole rather than left
    # as a severed head. Read as a scalar, not as ORM rows: the delete below would
    # otherwise leave stale objects in the identity map.
    earliest_open = await session.scalar(
        select(func.min(LocationVisit.entered_at))
        .where(LocationVisit.location_id.in_(fence_ids))
        .where(LocationVisit.source == "derived")
        .where(LocationVisit.entered_at < since)
        .where(LocationVisit.exited_at.is_(None))
    )
    window_start = min(earliest_open, since) if earliest_open else since

    await session.execute(
        delete(LocationVisit)
        .where(LocationVisit.location_id.in_(fence_ids))
        .where(LocationVisit.source == "derived")
        .where(LocationVisit.entered_at >= window_start)
    )

    fixes = await _fixes_between(session, window_start, until)
    derived = derive_visits(fixes, fences)
    if derived:
        await session.execute(
            LocationVisit.__table__.insert(), [v.as_row() for v in derived]
        )
    return len(derived)


async def evaluate_ping(session: AsyncSession, fix: Fix) -> None:
    """Live path: fold one just-stored fix into the open visits.

    Deliberately thin. Anything it declines to handle — a backfilled fix, an
    imprecise one, a fence that moved a second ago — is picked up by the tick's
    replay, so this never has to be clever enough to be wrong in a lasting way.
    """
    fences = await load_fences(session)
    held = await _manually_held(session)
    fences = [f for f in fences if f.id not in held]
    if not fences:
        return

    newest = await session.scalar(
        select(LocationPing.recorded_at)
        .order_by(LocationPing.recorded_at.desc())
        .limit(1)
    )
    if (
        newest is not None
        and (newest - fix.recorded_at).total_seconds() > settings.backfill_grace_seconds
    ):
        return  # backfill; the replay owns it

    open_rows = await session.execute(
        select(LocationVisit)
        .where(LocationVisit.exited_at.is_(None))
        .where(LocationVisit.source == "derived")
    )
    rows = {v.location_id: v for v in open_rows.scalars()}
    carry = [
        DerivedVisit(
            location_id=v.location_id,
            entered_at=v.entered_at,
            last_seen_inside_at=v.last_seen_inside_at,
            ping_count=v.ping_count,
            pending_exit_count=v.pending_exit_count,
            first_ping_id=v.first_ping_id,
            last_ping_id=v.last_ping_id,
        )
        for v in rows.values()
    ]
    after = derive_visits([fix], fences, carry=carry)

    for visit in after:
        row = rows.get(visit.location_id)
        if row is None:
            # Arriving. Through the ORM, so it reaches change_log and the SSE stream
            # tells the UI "you are here" — a handful of these a day, not per ping.
            session.add(LocationVisit(**visit.as_row()))
        elif visit.exited_at is not None:
            # Leaving is a real event too, so it also goes through the ORM.
            row.exited_at = visit.exited_at
            row.close_reason = visit.close_reason
            row.last_seen_inside_at = visit.last_seen_inside_at
            row.ping_count = visit.ping_count
            row.last_ping_id = visit.last_ping_id
        else:
            # Still inside. These columns move on *every* fix while you are within a
            # fence — inside four nested fences that would be four change_log rows
            # and four SSE frames per ping. Core update: silent by construction.
            await session.execute(
                LocationVisit.__table__.update()
                .where(LocationVisit.id == row.id)
                .values(
                    last_seen_inside_at=visit.last_seen_inside_at,
                    pending_exit_count=visit.pending_exit_count,
                    ping_count=visit.ping_count,
                    last_ping_id=visit.last_ping_id,
                )
            )
