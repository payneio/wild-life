"""Visits end to end: ingest a track, watch fences fill in, ask where you were.

Two paths get exercised separately, because they are separate on purpose. Fixes
arriving at the head of the stream go through the live evaluator during ingest;
anything older is left to `rebuild_visits`. Tests that mean to exercise the replay
therefore publish into a historical window and ask for a rebuild, rather than
expecting ingest to have done it.

The historical windows are set in the past for isolation: this runs against the real
castle Postgres, where the actual phone is also depositing pings, and a fix from
somewhere else in the middle of a test window would legitimately close its visits.

Everything is MARK-prefixed and removed in a `finally`.
"""

import base64
from collections.abc import Iterator
from datetime import UTC, datetime, timedelta

import pytest
from fastapi.testclient import TestClient
from sqlalchemy import create_engine, text

from wild_life.config import settings
from wild_life.geofence import invalidate_fences

MARK = "ZZ-visit-test"
SECRET = "test-ingest-secret"
OFFICE = (47.6205, -122.3493)


@pytest.fixture
def ingest_enabled(monkeypatch: pytest.MonkeyPatch) -> Iterator[None]:
    monkeypatch.setattr(settings, "ingest_token", SECRET)
    invalidate_fences()
    yield
    invalidate_fences()


def _basic() -> dict[str, str]:
    encoded = base64.b64encode(f"phone:{SECRET}".encode()).decode()
    return {"Authorization": f"Basic {encoded}", "X-Limit-D": MARK}


def _north(lat: float, lon: float, metres: float) -> tuple[float, float]:
    return lat + metres / 111_320.0, lon


def _publish(
    client: TestClient, when: datetime, lat: float, lon: float, acc: float = 10
) -> None:
    r = client.post(
        "/ingest/owntracks",
        headers=_basic(),
        json={
            "_type": "location",
            "lat": lat,
            "lon": lon,
            "tst": int(when.timestamp()),
            "acc": acc,
            "tid": "zz",
        },
    )
    assert r.status_code == 200, r.text


def _cleanup(client: TestClient, headers: dict, location_ids: list[str]) -> None:
    engine = create_engine(settings.sync_database_url)
    try:
        with engine.begin() as conn:
            conn.execute(
                text("DELETE FROM wild_life.location_pings WHERE device_id = :d"),
                {"d": MARK},
            )
    finally:
        engine.dispose()
    for lid in location_ids:
        client.delete(f"/locations/{lid}", headers=headers)  # visits cascade


def _make_location(client: TestClient, headers: dict, name: str, radius: float) -> dict:
    r = client.post(
        "/locations",
        headers=headers,
        json={
            "name": f"{MARK} {name}",
            "latitude": OFFICE[0],
            "longitude": OFFICE[1],
            "radius_m": radius,
        },
    )
    assert r.status_code in (200, 201), r.text
    return r.json()


def _visits(client: TestClient, headers: dict, location_id: str) -> list[dict]:
    r = client.get(f"/locations/{location_id}/visits", headers=headers)
    assert r.status_code == 200, r.text
    return r.json()


# --- the live path ---------------------------------------------------------


def test_nested_fences_open_concurrent_visits(
    client: TestClient, auth_headers: dict, ingest_enabled: None, require_db: None
) -> None:
    """The whole point of deriving nesting from geometry: you are in all of them."""
    made: list[str] = []
    try:
        city = _make_location(client, auth_headers, "city", 15_000)
        office = _make_location(client, auth_headers, "office", 75)
        made += [city["id"], office["id"]]
        invalidate_fences()

        _publish(client, datetime.now(UTC) - timedelta(seconds=10), *OFFICE)

        r = client.get("/where-was-i", headers=auth_headers)
        assert r.status_code == 200, r.text
        places = r.json()["places"]
        ids = [p["location_id"] for p in places]
        # A subset, not an equality. `/where-was-i` answers *where you are*, and
        # these tests share the database with the running app — so any visit the
        # owner has open right now is legitimately in this list too. Asserting
        # the exact set made the test a function of whether someone happened to
        # be somewhere, which is why it failed sitting still at a real address.
        # The claim being made here is "you are in all of them", and that is what
        # a subset says.
        assert {city["id"], office["id"]} <= set(ids)
        # Innermost first — the nearest fence is "the place", the tail is the
        # breadcrumb out of it. Read off this test's own two rather than the
        # head of the list, which an unrelated open visit can precede.
        mine = [p for p in places if p["location_id"] in {city["id"], office["id"]}]
        assert mine[0]["location_id"] == office["id"]
        assert mine[0]["radius_m"] < mine[1]["radius_m"]
    finally:
        _cleanup(client, auth_headers, made)


def test_staying_put_does_not_flood_the_change_log(
    client: TestClient, auth_headers: dict, ingest_enabled: None, require_db: None
) -> None:
    """Arriving and leaving are events; staying put is not.

    Per-ping columns are written with Core updates precisely so a stationary phone
    inside nested fences does not put a change_log row — and therefore an SSE frame
    to every open tab — on every fix it sends.
    """
    made: list[str] = []
    engine = create_engine(settings.sync_database_url)
    try:
        city = _make_location(client, auth_headers, "flood city", 15_000)
        office = _make_location(client, auth_headers, "flood office", 75)
        made += [city["id"], office["id"]]
        invalidate_fences()

        def visit_log_count() -> int:
            with engine.connect() as conn:
                return conn.execute(
                    text(
                        "SELECT count(*) FROM wild_life.change_log "
                        "WHERE entity_type = 'location_visits'"
                    )
                ).scalar_one()

        before = visit_log_count()
        # Tight and recent, so every fix is the newest and takes the live path.
        now = datetime.now(UTC)
        for i in range(12):
            _publish(client, now - timedelta(seconds=60 - i * 5), *OFFICE)

        # Two arrivals (city, office) — and nothing at all for the ten that followed.
        assert visit_log_count() - before == 2
    finally:
        engine.dispose()
        _cleanup(client, auth_headers, made)


# --- the replay path -------------------------------------------------------


def test_a_fence_drawn_later_backfills_its_own_history(
    client: TestClient, auth_headers: dict, ingest_enabled: None, require_db: None
) -> None:
    """The payoff of keeping pings as the only non-derived tier.

    Fixes arrive before the place has a name; drawing the fence afterwards must
    explain them rather than ignore them.
    """
    made: list[str] = []
    try:
        base = datetime(2021, 6, 1, 9, 0, tzinfo=UTC)
        for i in range(4):
            _publish(client, base + timedelta(minutes=i * 5), *OFFICE)
        _publish(client, base + timedelta(minutes=40), *_north(*OFFICE, 5_000))

        # Only now does the place exist.
        office = _make_location(client, auth_headers, "late office", 75)
        made.append(office["id"])
        invalidate_fences()

        assert _visits(client, auth_headers, office["id"]) == [], (
            "ingest should not have derived anything for a fence that did not exist"
        )

        r = client.post(
            f"/locations/{office['id']}/rebuild-visits", headers=auth_headers
        )
        assert r.status_code == 200, r.text
        assert r.json()["visits"] == 1

        visits = _visits(client, auth_headers, office["id"])
        assert len(visits) == 1
        assert visits[0]["ping_count"] == 4
        assert visits[0]["entered_at"].startswith(base.isoformat()[:16])
    finally:
        _cleanup(client, auth_headers, made)


def test_leaving_closes_the_visit_at_the_last_confirmed_sighting(
    client: TestClient, auth_headers: dict, ingest_enabled: None, require_db: None
) -> None:
    made: list[str] = []
    try:
        base = datetime(2021, 7, 1, 9, 0, tzinfo=UTC)
        last_inside = base + timedelta(minutes=10)
        _publish(client, base, *OFFICE)
        _publish(client, last_inside, *OFFICE)
        _publish(client, base + timedelta(minutes=20), *_north(*OFFICE, 5_000))

        office = _make_location(client, auth_headers, "departure", 75)
        made.append(office["id"])
        invalidate_fences()
        client.post(f"/locations/{office['id']}/rebuild-visits", headers=auth_headers)

        visits = _visits(client, auth_headers, office["id"])
        assert len(visits) == 1
        assert visits[0]["close_reason"] == "exit"
        # Stamped from the last confirmed sighting, not from the fix that proved it:
        # you left somewhere in between, and this is the honest lower bound.
        assert visits[0]["exited_at"].startswith(last_inside.isoformat()[:16])

        # The historical question still answers, which is the whole point.
        r = client.get(
            "/where-was-i",
            headers=auth_headers,
            params={"at": (base + timedelta(minutes=5)).isoformat()},
        )
        assert [p["location_id"] for p in r.json()["places"]] == [office["id"]]

        r = client.get(
            "/where-was-i",
            headers=auth_headers,
            params={"at": (base + timedelta(hours=3)).isoformat()},
        )
        assert r.json()["places"] == []
    finally:
        _cleanup(client, auth_headers, made)


def test_moving_a_fence_marks_it_dirty_and_the_tick_re_derives(
    client: TestClient, auth_headers: dict, ingest_enabled: None, require_db: None
) -> None:
    """Editing a radius must not re-derive inline — the slider autosaves per keystroke."""
    made: list[str] = []
    try:
        # Historical, like the other replay tests: the tick's dirty-fence rebuild
        # reads all of history, so a recent window would let the real device's
        # readings interleave with these and split the visit in two.
        base = datetime(2021, 8, 1, 9, 0, tzinfo=UTC)
        for i in range(3):
            _publish(client, base + timedelta(minutes=i * 5), *_north(*OFFICE, 300))

        # A fence too small to contain those fixes.
        spot = _make_location(client, auth_headers, "widening", 50)
        made.append(spot["id"])
        invalidate_fences()
        client.post(f"/locations/{spot['id']}/rebuild-visits", headers=auth_headers)
        assert _visits(client, auth_headers, spot["id"]) == []

        # Widen it so they now fall inside. The PATCH only marks work to do.
        r = client.patch(
            f"/locations/{spot['id']}", headers=auth_headers, json={"radius_m": 600}
        )
        assert r.status_code == 200, r.text
        assert r.json()["geo_dirty_at"] is not None, "a moved fence should be flagged"

        r = client.post("/locations/tick", headers=auth_headers)
        assert r.status_code == 200, r.text

        visits = _visits(client, auth_headers, spot["id"])
        assert len(visits) == 1
        assert visits[0]["ping_count"] == 3
        # ...and the flag is cleared, so the next tick does no work.
        assert (
            client.get(f"/locations/{spot['id']}", headers=auth_headers).json()[
                "geo_dirty_at"
            ]
            is None
        )
    finally:
        _cleanup(client, auth_headers, made)
