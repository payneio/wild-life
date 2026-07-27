"""Stop detection and clustering — the proposals the system makes.

Pure functions, so the interesting cases are cheap to state. The one worth
reading is `test_a_commute_is_not_a_place`: clustering raw readings instead of
dwell-defined stops would make every traffic light a candidate, and that failure
is what the whole three-pass structure exists to avoid.
"""

from datetime import UTC, datetime, timedelta

from wild_life.config import settings
from wild_life.geofence import Fix
from wild_life.stops import cluster_stops, detect_stops

CAFE = (47.6205, -122.3493)
T0 = datetime(2026, 7, 1, 8, 0, tzinfo=UTC)


def _fix(minutes: float, lat: float, lon: float, acc: float = 10) -> Fix:
    return Fix(
        id=int(minutes * 60),
        recorded_at=T0 + timedelta(minutes=minutes),
        latitude=lat,
        longitude=lon,
        accuracy_m=acc,
    )


def _north(lat: float, lon: float, metres: float) -> tuple[float, float]:
    return lat + metres / 111_320.0, lon


def _sitting(start: float, minutes: float, at: tuple[float, float]) -> list[Fix]:
    """A run of readings from one spot, every 5 minutes."""
    return [_fix(start + i * 5, *at) for i in range(int(minutes / 5) + 1)]


def test_sitting_still_long_enough_is_a_stop() -> None:
    stops = detect_stops(_sitting(0, 40, CAFE))
    assert len(stops) == 1
    assert stops[0].seconds >= settings.stop_min_dwell_seconds


def test_passing_through_is_not_a_stop() -> None:
    """Ten minutes at a spot is being somewhere; two is going past it."""
    stops = detect_stops(_sitting(0, 5, CAFE))
    assert stops == []


def test_a_commute_is_not_a_place() -> None:
    """The failure the three-pass structure exists to prevent.

    A drive deposits far more readings on the road than a café does inside it, so
    clustering readings would rank the road highest. Clustering *stops* ignores it.
    """
    drive = [_fix(i, *_north(*CAFE, i * 400)) for i in range(30)]
    assert detect_stops(drive) == []


def test_a_long_gap_splits_a_stop() -> None:
    """Two mornings at the same desk are two stops, not one very long one."""
    day_one = _sitting(0, 40, CAFE)
    day_two = _sitting(60 * 24, 40, CAFE)
    stops = detect_stops(day_one + day_two)
    assert len(stops) == 2


def test_imprecise_readings_are_ignored() -> None:
    """Stop detection is a question about metres; a 300 m fix cannot answer it."""
    vague = [_fix(i * 5, *CAFE, acc=300) for i in range(9)]
    assert detect_stops(vague) == []


def test_repeat_visits_become_one_proposal() -> None:
    """Eight mornings at the same café is one place, not eight."""
    fixes: list[Fix] = []
    for day in range(8):
        fixes += _sitting(day * 60 * 24, 40, CAFE)

    clusters = cluster_stops(detect_stops(fixes))

    assert len(clusters) == 1
    assert clusters[0].stop_count == 8
    assert clusters[0].total_seconds >= 8 * 40 * 60


def test_distinct_places_stay_distinct() -> None:
    far = _north(*CAFE, 5_000)
    fixes = _sitting(0, 40, CAFE) + _sitting(60 * 24, 40, far)

    clusters = cluster_stops(detect_stops(fixes))

    assert len(clusters) == 2


def test_clustering_is_deterministic() -> None:
    """Same readings, same proposals — what lets the nightly recompute be idempotent."""
    fixes: list[Fix] = []
    for day in range(4):
        fixes += _sitting(day * 60 * 24, 30, CAFE)
    stops = detect_stops(fixes)

    first = cluster_stops(stops)
    second = cluster_stops(stops)

    assert [(c.latitude, c.longitude, c.stop_count) for c in first] == [
        (c.latitude, c.longitude, c.stop_count) for c in second
    ]
