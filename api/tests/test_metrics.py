"""Metric entries as instants, and the cadence that drives the overdue check.

Needs the castle Postgres. Everything created here is prefixed with MARK and
deleted in a `finally`, since these run against the real database.
"""

from datetime import UTC, datetime, timedelta

from fastapi.testclient import TestClient

MARK = "ZZ-metric-test"


def _post(client: TestClient, headers: dict, path: str, **body: object) -> dict:
    r = client.post(path, headers=headers, json=body)
    assert r.status_code in (200, 201), (path, r.status_code, r.text)
    return r.json()


def _rooted_metric(client: TestClient, headers: dict, areas: list[str], **body) -> dict:
    """A metric measures something, so it needs a root. These tests don't care
    which — they're about readings and cadence — so each gets a scratch area."""
    area = _post(client, headers, "/areas", name=f"{MARK} root {len(areas)}")
    areas.append(area["id"])
    return _post(
        client, headers, "/metrics", entity_type="area", entity_id=area["id"], **body
    )


def test_two_readings_the_same_day_stay_distinct(
    client: TestClient, auth_headers: dict, require_db: None
) -> None:
    """The reason `recorded_at` is an instant: a metric read several times a day.

    Under the old `entry_date` these two rows were indistinguishable — same day,
    and nothing else to tell them apart or order them by.
    """
    owner = auth_headers
    metrics: list[str] = []
    areas: list[str] = []
    try:
        m = _rooted_metric(
            client, owner, areas, name=f"{MARK} blood pressure", unit="mmHg"
        )
        metrics.append(m["id"])

        morning = "2026-03-04T15:12:00Z"  # 07:12 local
        evening = "2026-03-04T22:03:00Z"  # 14:03 local
        _post(
            client,
            owner,
            "/metric-entries",
            metric_id=m["id"],
            value=128,
            recorded_at=evening,
        )
        _post(
            client,
            owner,
            "/metric-entries",
            metric_id=m["id"],
            value=141,
            recorded_at=morning,
        )

        got = client.get(f"/metrics/{m['id']}/entries", headers=owner).json()
        assert len(got) == 2, got
        # Nested listing is chronological, so the sparkline reads left-to-right.
        assert [e["value"] for e in got] == [141.0, 128.0], got
        stamps = [datetime.fromisoformat(e["recorded_at"]) for e in got]
        assert stamps[0] < stamps[1]
        # Tz-aware round-trip: the moment survives, not just the day.
        assert all(s.tzinfo is not None for s in stamps)
        assert stamps[0] == datetime.fromisoformat(morning)
    finally:
        for mid in metrics:
            client.delete(f"/metrics/{mid}", headers=owner)  # cascades to entries
        for aid in areas:
            client.delete(f"/areas/{aid}", headers=owner)


def test_measurement_frequency_is_a_closed_enum(
    client: TestClient, auth_headers: dict, require_db: None
) -> None:
    """It used to be free text parsed by substring match, so "biweekly" silently
    meant weekly and "every other day" meant daily. Now the API says no."""
    owner = auth_headers
    metrics: list[str] = []
    areas: list[str] = []
    try:
        m = _rooted_metric(client, owner, areas, name=f"{MARK} enum")
        metrics.append(m["id"])

        bad = client.patch(
            f"/metrics/{m['id']}",
            headers=owner,
            json={"measurement_frequency": "twice a week-ish"},
        )
        assert bad.status_code == 422, bad.text

        ok = client.patch(
            f"/metrics/{m['id']}",
            headers=owner,
            json={"measurement_frequency": "weekly"},
        )
        assert ok.status_code == 200, ok.text
        assert ok.json()["measurement_frequency"] == "weekly"
    finally:
        for mid in metrics:
            client.delete(f"/metrics/{mid}", headers=owner)
        for aid in areas:
            client.delete(f"/areas/{aid}", headers=owner)


def test_review_dashboard_flags_metrics_overdue_for_a_reading(
    client: TestClient, auth_headers: dict, require_db: None
) -> None:
    """The one thing measurement_frequency does. Three cases that must differ:
    never read, read long ago, read just now."""
    owner = auth_headers
    metrics: list[str] = []
    areas: list[str] = []
    try:
        never = _rooted_metric(
            client,
            owner,
            areas,
            name=f"{MARK} never",
            measurement_frequency="weekly",
        )
        stale = _rooted_metric(
            client,
            owner,
            areas,
            name=f"{MARK} stale",
            measurement_frequency="weekly",
        )
        fresh = _rooted_metric(
            client,
            owner,
            areas,
            name=f"{MARK} fresh",
            measurement_frequency="weekly",
        )
        metrics += [never["id"], stale["id"], fresh["id"]]

        now = datetime.now(UTC)
        _post(
            client,
            owner,
            "/metric-entries",
            metric_id=stale["id"],
            value=1,
            recorded_at=(now - timedelta(days=30)).isoformat(),
        )
        _post(
            client,
            owner,
            "/metric-entries",
            metric_id=fresh["id"],
            value=1,
            recorded_at=now.isoformat(),
        )

        dash = client.get("/review-dashboard", headers=owner).json()
        overdue = {row["id"] for row in dash["metrics_overdue"]}
        assert never["id"] in overdue, "a metric never read is overdue"
        assert stale["id"] in overdue, "30 days without a weekly reading is overdue"
        assert fresh["id"] not in overdue, "read today — nothing to nag about"
    finally:
        for mid in metrics:
            client.delete(f"/metrics/{mid}", headers=owner)
        for aid in areas:
            client.delete(f"/areas/{aid}", headers=owner)


def test_a_metric_with_no_cadence_is_never_nagged_about(
    client: TestClient, auth_headers: dict, require_db: None
) -> None:
    """Blank cadence is the "don't remind me" option, and most metrics use it."""
    owner = auth_headers
    metrics: list[str] = []
    areas: list[str] = []
    try:
        m = _rooted_metric(client, owner, areas, name=f"{MARK} quiet")
        metrics.append(m["id"])
        assert m["measurement_frequency"] is None

        dash = client.get("/review-dashboard", headers=owner).json()
        assert m["id"] not in {row["id"] for row in dash["metrics_overdue"]}
    finally:
        for mid in metrics:
            client.delete(f"/metrics/{mid}", headers=owner)
        for aid in areas:
            client.delete(f"/areas/{aid}", headers=owner)
