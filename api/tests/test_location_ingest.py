"""Device ingest: HTTP Basic in, `200 []` out, no matter what.

The governing rule is that OwnTracks retries any non-2xx, so anything we consider
malformed must still be acknowledged or a single bad message becomes an infinite
retry loop on a battery-powered phone. Most of these tests assert exactly that.

Needs the castle Postgres. Pings carry a MARK device id and are deleted in a
`finally`.
"""

import base64
from datetime import UTC, datetime, timedelta

import pytest
from fastapi.testclient import TestClient
from sqlalchemy import create_engine, text

from wild_life.config import settings

MARK = "ZZ-ingest-test"
SECRET = "test-ingest-secret"


@pytest.fixture
def ingest_enabled(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setattr(settings, "ingest_token", SECRET)


def _basic(password: str, user: str = "phone") -> dict[str, str]:
    encoded = base64.b64encode(f"{user}:{password}".encode()).decode()
    return {"Authorization": f"Basic {encoded}", "X-Limit-D": MARK}


def _location_payload(tst: int, **overrides: object) -> dict:
    return {
        "_type": "location",
        "lat": 47.6205,
        "lon": -122.3493,
        "tst": tst,
        "acc": 12,
        "batt": 88,
        "bs": 1,
        "vel": 0,
        "tid": "pp",
        "t": "p",
        "conn": "w",
    } | overrides


def _epoch(**delta: float) -> int:
    return int((datetime.now(UTC) - timedelta(**delta)).timestamp())


def _rows() -> list[dict]:
    engine = create_engine(settings.sync_database_url)
    try:
        with engine.connect() as conn:
            return [
                dict(r)
                for r in conn.execute(
                    text(
                        "SELECT * FROM wild_life.location_pings "
                        "WHERE device_id = :d ORDER BY recorded_at"
                    ),
                    {"d": MARK},
                ).mappings()
            ]
    finally:
        engine.dispose()


def _cleanup() -> None:
    engine = create_engine(settings.sync_database_url)
    try:
        with engine.begin() as conn:
            conn.execute(
                text("DELETE FROM wild_life.location_pings WHERE device_id = :d"),
                {"d": MARK},
            )
    finally:
        engine.dispose()


def test_basic_auth_stores_a_ping(
    client: TestClient, ingest_enabled: None, require_db: None
) -> None:
    try:
        tst = _epoch(minutes=5)
        r = client.post(
            "/ingest/owntracks", headers=_basic(SECRET), json=_location_payload(tst)
        )
        assert r.status_code == 200, r.text
        # OwnTracks expects a JSON array back; we never push anything down.
        assert r.json() == []

        rows = _rows()
        assert len(rows) == 1
        row = rows[0]
        assert row["latitude"] == pytest.approx(47.6205)
        assert row["longitude"] == pytest.approx(-122.3493)
        assert row["accuracy_m"] == pytest.approx(12)
        assert row["battery_pct"] == 88
        assert row["message_type"] == "location"
        assert row["device_id"] == MARK  # X-Limit-D wins over tid
        assert row["recorded_at"] == datetime.fromtimestamp(tst, tz=UTC)
        assert row["raw"]["_type"] == "location"  # the payload is kept whole
    finally:
        _cleanup()


def test_redelivery_is_a_no_op(
    client: TestClient, ingest_enabled: None, require_db: None
) -> None:
    """OwnTracks re-posts queued messages after a network failure."""
    try:
        payload = _location_payload(_epoch(minutes=7))
        for _ in range(3):
            r = client.post("/ingest/owntracks", headers=_basic(SECRET), json=payload)
            assert r.status_code == 200
        assert len(_rows()) == 1
    finally:
        _cleanup()


def test_wrong_password_is_rejected(
    client: TestClient, ingest_enabled: None, require_db: None
) -> None:
    r = client.post(
        "/ingest/owntracks",
        headers=_basic("not-the-secret"),
        json=_location_payload(_epoch(minutes=1)),
    )
    assert r.status_code == 401
    assert _rows() == []


def test_basic_is_refused_off_the_ingest_path(
    client: TestClient, ingest_enabled: None, require_db: None
) -> None:
    """The device credential opens exactly one door."""
    r = client.get("/locations", headers=_basic(SECRET))
    assert r.status_code == 401


def test_ingest_closed_when_no_token_configured(
    client: TestClient, monkeypatch: pytest.MonkeyPatch, require_db: None
) -> None:
    monkeypatch.setattr(settings, "ingest_token", "")
    r = client.post(
        "/ingest/owntracks",
        headers=_basic(""),
        json=_location_payload(_epoch(minutes=1)),
    )
    assert r.status_code == 401


@pytest.mark.parametrize(
    "body",
    [
        "not json at all",
        "[1, 2, 3]",  # valid JSON, wrong shape
        '{"_type": "location"}',  # required fields missing
        '{"_type": "location", "lat": 999, "lon": 0, "tst": 1750000000}',  # out of range
        '{"_type": "waypoints", "waypoints": []}',  # a type we ignore
        '{"no_type": true}',
    ],
)
def test_bad_messages_are_acknowledged_not_retried(
    client: TestClient, ingest_enabled: None, require_db: None, body: str
) -> None:
    """A non-2xx here would make the tracker retry a poison payload forever."""
    try:
        r = client.post(
            "/ingest/owntracks",
            headers=_basic(SECRET) | {"Content-Type": "application/json"},
            content=body,
        )
        assert r.status_code == 200, r.text
        assert r.json() == []
        assert _rows() == []
    finally:
        _cleanup()


@pytest.mark.parametrize("tst", [0, 1_000_000, 4_000_000_000])
def test_implausible_clock_is_dropped_but_acknowledged(
    client: TestClient, ingest_enabled: None, require_db: None, tst: int
) -> None:
    """A broken clock would otherwise plant a phantom at the edge of every query."""
    try:
        r = client.post(
            "/ingest/owntracks", headers=_basic(SECRET), json=_location_payload(tst)
        )
        assert r.status_code == 200
        assert _rows() == []
    finally:
        _cleanup()


def test_transitions_are_stored_but_marked(
    client: TestClient, ingest_enabled: None, require_db: None
) -> None:
    """Device-side regions are unused, but discarding the rows is irreversible."""
    try:
        r = client.post(
            "/ingest/owntracks",
            headers=_basic(SECRET),
            json={
                "_type": "transition",
                "event": "enter",
                "lat": 47.6205,
                "lon": -122.3493,
                "tst": _epoch(minutes=3),
                "acc": 9,
                "desc": "office",
                "tid": "pp",
            },
        )
        assert r.status_code == 200
        rows = _rows()
        assert len(rows) == 1
        assert rows[0]["message_type"] == "transition"
        assert rows[0]["transition_event"] == "enter"
    finally:
        _cleanup()


def test_owner_bearer_token_also_works(
    client: TestClient, auth_headers: dict, ingest_enabled: None, require_db: None
) -> None:
    """Basic is an extra carrier on this path, not a replacement — curl still works."""
    try:
        r = client.post(
            "/ingest/owntracks",
            headers=auth_headers | {"X-Limit-D": MARK},
            json=_location_payload(_epoch(minutes=11)),
        )
        assert r.status_code == 200
        assert len(_rows()) == 1
    finally:
        _cleanup()
