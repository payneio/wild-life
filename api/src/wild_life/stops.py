"""Finding the places you keep going back to, before they have names.

Three passes, and the ordering carries the whole idea:

1. Segment readings into **stops** — runs that stayed put long enough to mean
   something. This is the step that makes the rest work. Clustering raw readings
   instead would turn every traffic light, bus stop and slow left turn into a
   candidate, because a commute deposits far more readings on the road than a
   café does inside it.
2. Drop stops that already fall inside a fence. Those are visits; a discovery is
   by definition somewhere you have not named.
3. Agglomerate the remainder by proximity, so eight mornings at the same café are
   one proposal rather than eight.

The output is deliberately a *proposal*, not a place. Nothing here writes a
Location — that stays a decision you make.
"""

import uuid
from collections.abc import Sequence
from dataclasses import dataclass
from datetime import datetime, timedelta, timezone

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from wild_life.config import settings
from wild_life.geo import haversine_m
from wild_life.geofence import Fix, load_fences
from wild_life.models.locations import LocationPing, PlaceCandidate

# A reading this imprecise cannot tell a building from its car park, and stop
# detection is a question about metres.
MAX_STOP_ACCURACY_M = 100


@dataclass
class Stop:
    """A stretch of time spent within a small radius."""

    latitude: float
    longitude: float
    started_at: datetime
    ended_at: datetime

    @property
    def seconds(self) -> float:
        return (self.ended_at - self.started_at).total_seconds()


@dataclass
class Cluster:
    """Stops at the same spot, folded together — one proposal."""

    latitude: float
    longitude: float
    radius_m: float
    stop_count: int
    total_seconds: float
    first_seen_at: datetime
    last_seen_at: datetime


def detect_stops(fixes: Sequence[Fix]) -> list[Stop]:
    """Pass 1: readings → stops."""
    stops: list[Stop] = []
    run: list[Fix] = []

    def flush() -> None:
        if not run:
            return
        stop = Stop(
            latitude=sum(f.latitude for f in run) / len(run),
            longitude=sum(f.longitude for f in run) / len(run),
            started_at=run[0].recorded_at,
            ended_at=run[-1].recorded_at,
        )
        if stop.seconds >= settings.stop_min_dwell_seconds:
            stops.append(stop)

    for fix in fixes:
        if fix.accuracy_m is None or fix.accuracy_m > MAX_STOP_ACCURACY_M:
            continue
        if run:
            centre_lat = sum(f.latitude for f in run) / len(run)
            centre_lon = sum(f.longitude for f in run) / len(run)
            moved = haversine_m(fix.latitude, fix.longitude, centre_lat, centre_lon)
            gap = (fix.recorded_at - run[-1].recorded_at).total_seconds()
            if moved > settings.stop_radius_m or gap > settings.stop_max_gap_seconds:
                flush()
                run = []
        run.append(fix)
    flush()
    return stops


def cluster_stops(stops: Sequence[Stop]) -> list[Cluster]:
    """Pass 3: stops → proposals, by single-link proximity."""
    clusters: list[Cluster] = []
    for stop in stops:
        for cluster in clusters:
            reach = max(cluster.radius_m, settings.stop_radius_m)
            if (
                haversine_m(
                    stop.latitude, stop.longitude, cluster.latitude, cluster.longitude
                )
                <= reach
            ):
                # Weighted mean, so a spot visited often settles on its real centre
                # rather than drifting toward the newest arrival.
                n = cluster.stop_count
                cluster.latitude = (cluster.latitude * n + stop.latitude) / (n + 1)
                cluster.longitude = (cluster.longitude * n + stop.longitude) / (n + 1)
                cluster.radius_m = max(
                    cluster.radius_m,
                    haversine_m(
                        stop.latitude,
                        stop.longitude,
                        cluster.latitude,
                        cluster.longitude,
                    )
                    + settings.stop_radius_m / 2,
                )
                cluster.stop_count = n + 1
                cluster.total_seconds += stop.seconds
                cluster.first_seen_at = min(cluster.first_seen_at, stop.started_at)
                cluster.last_seen_at = max(cluster.last_seen_at, stop.ended_at)
                break
        else:
            clusters.append(
                Cluster(
                    latitude=stop.latitude,
                    longitude=stop.longitude,
                    radius_m=settings.stop_radius_m,
                    stop_count=1,
                    total_seconds=stop.seconds,
                    first_seen_at=stop.started_at,
                    last_seen_at=stop.ended_at,
                )
            )
    return clusters


async def recompute_candidates(
    session: AsyncSession, *, since: datetime | None = None
) -> int:
    """Rebuild the proposal list from the reading log.

    Two rules here are easy to omit and expensive to omit:

    - **Round before assigning.** The audit listener skips objects dirtied without
      a real column change, so an idempotent recompute writes nothing. That only
      holds if float centroids do not jitter in their last digit — otherwise every
      nightly run rewrites every row and broadcasts it to every open tab.
    - **Never touch a decided candidate.** A dismissed proposal that gets rewritten
      comes back, so dismissing would do nothing but delay.
    """
    window = since or datetime.now(timezone.utc) - timedelta(
        days=settings.candidate_window_days
    )
    rows = await session.execute(
        select(
            LocationPing.id,
            LocationPing.recorded_at,
            LocationPing.latitude,
            LocationPing.longitude,
            LocationPing.accuracy_m,
        )
        .where(LocationPing.recorded_at >= window)
        .where(LocationPing.message_type == "location")
        .order_by(LocationPing.recorded_at)
    )
    fixes = [
        Fix(
            id=r.id,
            recorded_at=r.recorded_at,
            latitude=r.latitude,
            longitude=r.longitude,
            accuracy_m=r.accuracy_m,
        )
        for r in rows
    ]

    stops = detect_stops(fixes)

    # Pass 2: a stop inside a fence is a visit, not a discovery.
    fences = await load_fences(session, fresh=True)
    stops = [
        s
        for s in stops
        if not any(
            haversine_m(s.latitude, s.longitude, f.latitude, f.longitude) <= f.radius_m
            for f in fences
        )
    ]

    clusters = cluster_stops(stops)

    existing = list((await session.execute(select(PlaceCandidate))).scalars())
    decided = [
        c
        for c in existing
        if c.dismissed_at is not None or c.promoted_location_id is not None
    ]
    undecided = {c.id: c for c in existing if c not in decided}

    matched: set[uuid.UUID] = set()
    for cluster in clusters:
        # A cluster that lands on something already decided is that decision
        # again; leave it alone rather than re-proposing it every night.
        if any(
            haversine_m(
                cluster.latitude, cluster.longitude, d.centroid_lat, d.centroid_lon
            )
            <= max(cluster.radius_m, d.radius_m)
            for d in decided
        ):
            continue

        target = None
        for candidate in undecided.values():
            if candidate.id in matched:
                continue
            if haversine_m(
                cluster.latitude,
                cluster.longitude,
                candidate.centroid_lat,
                candidate.centroid_lon,
            ) <= max(cluster.radius_m, candidate.radius_m):
                target = candidate
                break

        values = {
            "centroid_lat": round(cluster.latitude, 6),
            "centroid_lon": round(cluster.longitude, 6),
            "radius_m": round(cluster.radius_m, 1),
            "stop_count": cluster.stop_count,
            "total_seconds": int(cluster.total_seconds),
            "first_seen_at": cluster.first_seen_at,
            "last_seen_at": cluster.last_seen_at,
        }
        if target is None:
            session.add(PlaceCandidate(**values))
        else:
            matched.add(target.id)
            for key, value in values.items():
                setattr(target, key, value)

    # An undecided proposal the readings no longer support is withdrawn — it was
    # only ever a guess, and a stale guess is clutter.
    for candidate in undecided.values():
        if candidate.id not in matched:
            await session.delete(candidate)

    return len(clusters)
