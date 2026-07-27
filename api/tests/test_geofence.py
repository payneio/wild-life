"""The visit state machine: nesting, hysteresis, accuracy, and staleness.

Most of this exercises `derive_visits`, which is pure — no database, no fixtures,
no clock. That is the point of putting the definition of a visit in a pure
function: the awkward cases are cheap to state.

The last test is the one that matters most. It asserts the incremental path used
during ingest agrees with a full replay, which is the only justification for having
two paths at all.
"""

import uuid
from datetime import UTC, datetime, timedelta

import pytest

from wild_life.config import settings
from wild_life.geo import encloses, fit_score, haversine_m
from wild_life.geofence import DerivedVisit, Fence, Fix, derive_visits

# Seattle-ish, so the numbers are recognisable.
OFFICE = (47.6205, -122.3493)
T0 = datetime(2026, 7, 27, 9, 0, tzinfo=UTC)


def _fence(lat: float, lon: float, radius: float) -> Fence:
    return Fence(id=uuid.uuid4(), latitude=lat, longitude=lon, radius_m=radius)


def _fix(minutes: float, lat: float, lon: float, acc: float = 10) -> Fix:
    return Fix(
        id=int(minutes * 60),
        recorded_at=T0 + timedelta(minutes=minutes),
        latitude=lat,
        longitude=lon,
        accuracy_m=acc,
    )


def _offset(lat: float, lon: float, north_m: float) -> tuple[float, float]:
    """Move a point north by a distance, for building fixes at a known range."""
    return lat + north_m / 111_320.0, lon


# --- the maths -------------------------------------------------------------


def test_haversine_matches_a_known_distance() -> None:
    # Seattle Center to Pike Place Market, ~1.5 km.
    d = haversine_m(47.6205, -122.3493, 47.6097, -122.3422)
    assert 1_200 < d < 1_500


def _score(distance: float, radius: float, accuracy: float) -> float:
    return fit_score(
        distance,
        radius,
        accuracy,
        sigma_floor_m=settings.snap_sigma_floor_m,
        max_slack_sigma=settings.snap_max_slack_sigma,
        max_slack_m=settings.snap_max_slack_m,
    )


def test_a_fix_inside_the_fence_scores_full_marks() -> None:
    """However imprecise it is. Uncertainty decides how far *outside* still counts,
    not whether a fix that landed in the circle counts at all — that was the rule
    that made a 20 m fence impossible to use with 22 m fixes."""
    assert _score(0, 20, 22) == 1.0
    assert _score(19, 20, 22) == 1.0


def test_the_same_overshoot_is_read_against_the_fix_s_own_error() -> None:
    """30 m past the edge is forgivable from a coarse fix and damning from a sharp one."""
    assert _score(50, 20, 100) > 0.9  # well within one sigma
    assert _score(50, 20, 10) == 0.0  # three sigma out — not here


def test_a_vague_fix_cannot_claim_a_place_from_far_away() -> None:
    """The absolute cap. Without it the slack scales with uncertainty, so the less
    we knew the more confidently we would place you."""
    assert _score(300, 20, 190) == 0.0


def test_enclosure_is_what_separates_nesting_from_rivalry() -> None:
    city = (*OFFICE, 15_000)
    office = (*OFFICE, 75)
    assert encloses(*city, *office)
    assert not encloses(*office, *city)
    # Two bars thirty metres apart enclose neither — they are alternatives.
    bar = (*OFFICE, 20)
    next_door = (*_offset(*OFFICE, 30), 20)
    assert not encloses(*bar, *next_door)
    assert not encloses(*next_door, *bar)


# --- the state machine -----------------------------------------------------


def test_nesting_opens_concurrent_visits() -> None:
    """Being inside a city, a neighbourhood and a building is three open visits."""
    city = _fence(*OFFICE, 15_000)
    neighbourhood = _fence(*OFFICE, 800)
    office = _fence(*OFFICE, 75)

    visits = derive_visits([_fix(0, *OFFICE)], [city, neighbourhood, office])

    assert len(visits) == 3
    assert {v.location_id for v in visits} == {city.id, neighbourhood.id, office.id}
    assert all(v.exited_at is None for v in visits)


def test_leaving_the_small_fence_keeps_the_large_one() -> None:
    """Walking out of the building does not walk you out of the city."""
    city = _fence(*OFFICE, 15_000)
    office = _fence(*OFFICE, 75)
    away = _offset(*OFFICE, 400)  # out of the office, well inside the city

    visits = derive_visits(
        [_fix(0, *OFFICE), _fix(10, *OFFICE), _fix(15, *away), _fix(20, *away)],
        [city, office],
    )

    by_id = {v.location_id: v for v in visits}
    assert by_id[office.id].exited_at is not None
    assert by_id[city.id].exited_at is None


def test_sitting_at_the_boundary_produces_one_visit_not_forty() -> None:
    """The flapping case: a café just outside a fence, fixes wobbling across it.

    Without the UNKNOWN band and the consecutive-fix requirement, this is the
    failure that makes naive geofencing useless — an afternoon of arrivals and
    departures that never happened.
    """
    office = _fence(*OFFICE, 75)
    inside = OFFICE
    marginal = _offset(*OFFICE, 80)  # 5 m past the edge, well inside the hysteresis

    fixes = [_fix(0, *inside)]
    for i in range(1, 40):
        fixes.append(_fix(i, *(marginal if i % 2 else inside)))

    visits = derive_visits(fixes, [office])
    assert len(visits) == 1
    assert visits[0].exited_at is None


def test_a_decisive_departure_closes_immediately() -> None:
    """One unambiguous fix beats waiting: you should not stay 'at the office' on a drive."""
    office = _fence(*OFFICE, 75)
    far = _offset(*OFFICE, 5_000)

    visits = derive_visits(
        [_fix(0, *OFFICE), _fix(10, *OFFICE), _fix(15, *far)], [office]
    )

    assert len(visits) == 1
    assert visits[0].close_reason == "exit"


def test_exit_time_is_the_last_confirmed_sighting() -> None:
    """You left somewhere between the two fixes; the honest answer is the earlier one."""
    office = _fence(*OFFICE, 75)
    far = _offset(*OFFICE, 5_000)

    visits = derive_visits(
        [_fix(0, *OFFICE), _fix(30, *OFFICE), _fix(45, *far)], [office]
    )

    assert visits[0].exited_at == T0 + timedelta(minutes=30)


def test_imprecise_fixes_neither_open_nor_close() -> None:
    office = _fence(*OFFICE, 75)
    over = settings.geofence_max_accuracy_m + 1

    assert derive_visits([_fix(0, *OFFICE, acc=over)], [office]) == []

    # And once inside, a bad fix cannot evict you.
    visits = derive_visits(
        [_fix(0, *OFFICE), _fix(5, *_offset(*OFFICE, 9_000), acc=over)], [office]
    )
    assert visits[0].exited_at is None


def test_a_dead_phone_closes_the_visit_as_stale() -> None:
    """A phone that dies looks like sitting still. Say so, rather than believing it."""
    office = _fence(*OFFICE, 75)
    gap = settings.visit_stale_seconds / 60 + 60

    visits = derive_visits(
        [_fix(0, *OFFICE), _fix(10, *OFFICE), _fix(gap, *OFFICE)], [office]
    )

    stale = [v for v in visits if v.close_reason == "stale"]
    assert len(stale) == 1
    assert stale[0].exited_at == T0 + timedelta(minutes=10)
    # ...and the later fix starts a fresh visit rather than resuming the old one.
    assert any(v.exited_at is None for v in visits)


def test_carry_continues_a_visit_across_a_window_boundary() -> None:
    """Replaying a slice must not amputate a visit that began before it."""
    office = _fence(*OFFICE, 75)
    open_before = DerivedVisit(
        location_id=office.id,
        entered_at=T0 - timedelta(hours=1),
        last_seen_inside_at=T0 - timedelta(minutes=1),
    )

    visits = derive_visits([_fix(0, *OFFICE)], [office], carry=[open_before])

    assert len(visits) == 1
    assert visits[0].entered_at == T0 - timedelta(hours=1)


def test_derivation_is_deterministic() -> None:
    """Same input, same output — the property the whole design leans on."""
    office = _fence(*OFFICE, 75)
    fixes = [_fix(i, *(OFFICE if i % 3 else _offset(*OFFICE, 300))) for i in range(20)]

    first = derive_visits(fixes, [office])
    second = derive_visits(fixes, [office])

    assert [v.as_row() for v in first] == [v.as_row() for v in second]


@pytest.mark.parametrize("chunk", [1, 2, 3, 7])
def test_incremental_agrees_with_replay(chunk: int) -> None:
    """**The load-bearing test.**

    The ingest path folds in one fix at a time; the tick replays a whole window.
    If those disagree, the fast path is silently corrupting history between ticks.
    Feeding the same stream in different-sized chunks must reach the same answer.
    """
    fences = [_fence(*OFFICE, 15_000), _fence(*OFFICE, 800), _fence(*OFFICE, 75)]
    path = [
        OFFICE,
        OFFICE,
        _offset(*OFFICE, 80),  # marginal
        OFFICE,
        _offset(*OFFICE, 400),  # out of the office
        _offset(*OFFICE, 400),
        _offset(*OFFICE, 5_000),  # out of the neighbourhood
        _offset(*OFFICE, 5_000),
        OFFICE,  # back again
        OFFICE,
    ]
    fixes = [_fix(i * 5, *point) for i, point in enumerate(path)]

    whole = derive_visits(fixes, fences)

    # Now the same stream, folded in chunk by chunk, carrying the open visits
    # forward exactly as evaluate_ping does.
    closed: list[DerivedVisit] = []
    carry: list[DerivedVisit] = []
    for i in range(0, len(fixes), chunk):
        result = derive_visits(fixes[i : i + chunk], fences, carry=carry)
        closed += [v for v in result if v.exited_at is not None]
        carry = [v for v in result if v.exited_at is None]
    piecewise = closed + carry

    def key(v: DerivedVisit) -> tuple:
        return (str(v.location_id), v.entered_at)

    assert sorted((v.as_row() for v in piecewise), key=lambda r: str(r)) == sorted(
        (v.as_row() for v in whole), key=lambda r: str(r)
    ), f"incremental and replay diverged at chunk size {chunk}"
    assert sorted(piecewise, key=key) == sorted(whole, key=key)


# --- snapping: which place, not merely whether ------------------------------


def test_two_adjacent_bars_resolve_to_one() -> None:
    """The question a per-fence test cannot answer.

    Buckley's and the bar next door both plausibly contain a fix. They are not
    nested, so they are alternatives, and only the better one is credited.
    """
    here = _fence(*OFFICE, 20)
    next_door = _fence(*_offset(*OFFICE, 60), 20)

    fixes = [_fix(i * 10, *OFFICE) for i in range(3)]
    visits = derive_visits(fixes, [here, next_door])

    assert [v.location_id for v in visits] == [here.id]


def test_a_small_fence_works_with_coarser_fixes_than_itself() -> None:
    """The regression this whole redesign exists for.

    A 20 m fence and a 22 m fix used to be unusable, because entry demanded the
    fix be more precise than the fence. It only ever needs to land inside it.
    """
    bar = _fence(*OFFICE, 20)
    fixes = [_fix(i * 10, *OFFICE, acc=22) for i in range(3)]

    visits = derive_visits(fixes, [bar])

    assert len(visits) == 1
    assert visits[0].ping_count == 3


def test_nothing_is_claimed_when_the_nearest_place_is_far() -> None:
    """Snapping without a rejection rule would put you at the nearest bar from
    the next county. Being somewhere unknown is a real answer — and it is what
    feeds place discovery."""
    bar = _fence(*OFFICE, 20)
    elsewhere = _offset(*OFFICE, 5_000)

    assert derive_visits([_fix(i * 10, *elsewhere) for i in range(3)], [bar]) == []


def test_an_ambiguous_fix_picks_neither() -> None:
    """Two equally good candidates are not an excuse to guess."""
    left = _fence(*_offset(*OFFICE, -30), 20)
    right = _fence(*_offset(*OFFICE, 30), 20)

    # Dead between them, and imprecise enough that both fit equally well.
    visits = derive_visits(
        [_fix(i * 10, *OFFICE, acc=40) for i in range(3)], [left, right]
    )

    assert visits == []


def test_a_pass_through_is_not_a_visit() -> None:
    """One fix inside cannot distinguish a five-minute stop from a drive past."""
    bar = _fence(*OFFICE, 75)
    far = _offset(*OFFICE, 5_000)

    visits = derive_visits(
        [_fix(0, *far), _fix(5, *OFFICE), _fix(10, *far), _fix(15, *far)], [bar]
    )

    assert visits == []
