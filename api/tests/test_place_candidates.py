"""Discovery end to end: readings → a proposal → a place with its history filled in.

Geocoding is disabled throughout. It is the one path that leaves the box, and a
test suite that reaches out to OpenStreetMap would be both rude and flaky — the
promote must work without it anyway, which is the property worth asserting.

Needs the castle Postgres. MARK-prefixed, cleaned up in a `finally`.
"""

import base64
from collections.abc import Iterator
from datetime import UTC, datetime, timedelta

import pytest
from fastapi.testclient import TestClient
from sqlalchemy import create_engine, text

from wild_life.config import settings
from wild_life.geofence import invalidate_fences

MARK = "ZZ-cand-test"
SECRET = "test-ingest-secret"
# Deliberately away from anywhere the real device reports, so a live reading
# cannot wander into the middle of a test window.
SPOT = (44.0521, -123.0868)


@pytest.fixture
def discovery(monkeypatch: pytest.MonkeyPatch) -> Iterator[None]:
    monkeypatch.setattr(settings, "ingest_token", SECRET)
    monkeypatch.setattr(settings, "geocode_enabled", False)
    # Reach back far enough to see the historical windows below. They are in the
    # past for isolation: the real device is depositing readings into this same
    # database, and a live fix landing mid-window would split a test's stop.
    monkeypatch.setattr(settings, "candidate_window_days", 4000)
    invalidate_fences()
    yield
    invalidate_fences()


def _basic() -> dict[str, str]:
    encoded = base64.b64encode(f"phone:{SECRET}".encode()).decode()
    return {"Authorization": f"Basic {encoded}", "X-Limit-D": MARK}


def _publish(client: TestClient, when: datetime, lat: float, lon: float) -> None:
    r = client.post(
        "/ingest/owntracks",
        headers=_basic(),
        json={
            "_type": "location",
            "lat": lat,
            "lon": lon,
            "tst": int(when.timestamp()),
            "acc": 10,
            "tid": "zz",
        },
    )
    assert r.status_code == 200, r.text


def _sit(client: TestClient, base: datetime, minutes: int = 40) -> None:
    for i in range(0, minutes + 1, 5):
        _publish(client, base + timedelta(minutes=i), *SPOT)


def _sql(statement: str) -> None:
    engine = create_engine(settings.sync_database_url)
    try:
        with engine.begin() as conn:
            conn.execute(text(statement), {"d": MARK})
    finally:
        engine.dispose()


def _cleanup(client: TestClient, headers: dict, made: list[str]) -> None:
    _sql("DELETE FROM wild_life.location_pings WHERE device_id = :d")
    for lid in made:
        client.delete(f"/locations/{lid}", headers=headers)
    # Candidates have no delete route by design; they are derived.
    _sql(
        "DELETE FROM wild_life.place_candidates WHERE centroid_lat BETWEEN 44.0 AND 44.1"
    )


def _mine(client: TestClient, headers: dict) -> list[dict]:
    rows = client.get("/place-candidates?include_decided=true", headers=headers).json()
    return [c for c in rows if 44.0 < c["centroid_lat"] < 44.1]


def test_repeated_stops_become_a_proposal(
    client: TestClient, auth_headers: dict, discovery: None, require_db: None
) -> None:
    made: list[str] = []
    try:
        base = datetime(2021, 3, 1, 9, 0, tzinfo=UTC)
        for day in range(4):
            _sit(client, base + timedelta(days=day))

        r = client.post("/locations/tick?full=true", headers=auth_headers)
        assert r.status_code == 200, r.text

        mine = _mine(client, auth_headers)
        assert len(mine) == 1
        assert mine[0]["stop_count"] == 4
        assert mine[0]["total_seconds"] >= 4 * 40 * 60
    finally:
        _cleanup(client, auth_headers, made)


def test_recompute_is_idempotent(
    client: TestClient, auth_headers: dict, discovery: None, require_db: None
) -> None:
    """Every nightly run must not rewrite every row — that would broadcast the
    whole table to every open tab, nightly, forever."""
    made: list[str] = []
    engine = create_engine(settings.sync_database_url)
    try:
        base = datetime(2021, 4, 1, 9, 0, tzinfo=UTC)
        for day in range(4):
            _sit(client, base + timedelta(days=day))
        client.post("/locations/tick?full=true", headers=auth_headers)

        def log_count() -> int:
            with engine.connect() as conn:
                return conn.execute(
                    text(
                        "SELECT count(*) FROM wild_life.change_log "
                        "WHERE entity_type = 'place_candidates'"
                    )
                ).scalar_one()

        before = log_count()
        client.post("/locations/tick?full=true", headers=auth_headers)
        client.post("/locations/tick?full=true", headers=auth_headers)
        assert log_count() == before, "a second recompute rewrote rows it should not"
    finally:
        engine.dispose()
        _cleanup(client, auth_headers, made)


def test_dismissing_sticks_across_recompute(
    client: TestClient, auth_headers: dict, discovery: None, require_db: None
) -> None:
    """A dismissal that resurrects nightly would make dismissing pointless."""
    made: list[str] = []
    try:
        base = datetime(2021, 5, 1, 9, 0, tzinfo=UTC)
        for day in range(4):
            _sit(client, base + timedelta(days=day))
        client.post("/locations/tick?full=true", headers=auth_headers)

        candidate = _mine(client, auth_headers)[0]
        r = client.post(
            f"/place-candidates/{candidate['id']}/dismiss", headers=auth_headers
        )
        assert r.status_code == 200, r.text

        client.post("/locations/tick?full=true", headers=auth_headers)

        still = _mine(client, auth_headers)
        assert len(still) == 1
        assert still[0]["dismissed_at"] is not None
        # ...and it is gone from the review queue.
        queue = client.get("/place-candidates", headers=auth_headers).json()
        assert not [c for c in queue if 44.0 < c["centroid_lat"] < 44.1]
    finally:
        _cleanup(client, auth_headers, made)


def test_promoting_creates_a_place_and_backfills_its_history(
    client: TestClient, auth_headers: dict, discovery: None, require_db: None
) -> None:
    """The gesture the whole feature exists for."""
    made: list[str] = []
    try:
        base = datetime(2021, 6, 1, 9, 0, tzinfo=UTC)
        for day in range(4):
            _sit(client, base + timedelta(days=day))
        client.post("/locations/tick?full=true", headers=auth_headers)

        candidate = _mine(client, auth_headers)[0]
        r = client.post(
            f"/place-candidates/{candidate['id']}/promote",
            headers=auth_headers,
            json={"name": f"{MARK} the spot", "category": "venue"},
        )
        assert r.status_code == 200, r.text
        result = r.json()
        made.append(result["location"]["id"])

        assert result["geocoded"] is False, "geocoding was disabled for this test"
        assert result["location"]["name"] == f"{MARK} the spot"
        assert result["location"]["latitude"] == pytest.approx(SPOT[0], abs=1e-3)
        # The payoff: the new fence explains the stops that proposed it.
        assert result["visits"] == 4

        visits = client.get(
            f"/locations/{result['location']['id']}/visits", headers=auth_headers
        ).json()
        assert len(visits) == 4

        # And it leaves the queue rather than being proposed again.
        assert _mine(client, auth_headers)[0]["promoted_location_id"] is not None
        client.post("/locations/tick?full=true", headers=auth_headers)
        assert len(_mine(client, auth_headers)) == 1
    finally:
        _cleanup(client, auth_headers, made)


def test_promoting_twice_is_refused(
    client: TestClient, auth_headers: dict, discovery: None, require_db: None
) -> None:
    made: list[str] = []
    try:
        base = datetime(2021, 7, 1, 9, 0, tzinfo=UTC)
        for day in range(4):
            _sit(client, base + timedelta(days=day))
        client.post("/locations/tick?full=true", headers=auth_headers)

        candidate = _mine(client, auth_headers)[0]
        first = client.post(
            f"/place-candidates/{candidate['id']}/promote", headers=auth_headers
        )
        made.append(first.json()["location"]["id"])

        again = client.post(
            f"/place-candidates/{candidate['id']}/promote", headers=auth_headers
        )
        assert again.status_code == 409
    finally:
        _cleanup(client, auth_headers, made)
