"""Metrics that read themselves.

Needs the castle Postgres. Everything created here is prefixed with MARK and
deleted in a `finally`, since these run against the real database.
"""

from datetime import UTC, datetime, timedelta

from fastapi.testclient import TestClient

MARK = "ZZ-derived-test"


def _post(client: TestClient, headers: dict, path: str, **body: object) -> dict:
    r = client.post(path, headers=headers, json=body)
    assert r.status_code in (200, 201), (path, r.status_code, r.text)
    return r.json()


def test_a_derived_metric_must_name_a_computation(
    client: TestClient, auth_headers: dict, require_db: None
) -> None:
    """Derived with no derivation reads nothing, and has no entry to correct it."""
    areas: list[str] = []
    try:
        area = _post(client, auth_headers, "/areas", name=f"{MARK} area0")
        areas.append(area["id"])
        bad = client.post(
            "/metrics",
            headers=auth_headers,
            json={
                "name": f"{MARK} nameless",
                "entity_type": "area",
                "entity_id": area["id"],
                "source": "derived",
            },
        )
        assert bad.status_code == 422, bad.text

        # And the converse: a manual metric with a derivation is equally confused.
        also_bad = client.post(
            "/metrics",
            headers=auth_headers,
            json={
                "name": f"{MARK} confused",
                "entity_type": "area",
                "entity_id": area["id"],
                "source": "manual",
                "derivation": "task_throughput",
            },
        )
        assert also_bad.status_code == 422, also_bad.text
    finally:
        for a in areas:
            client.delete(f"/areas/{a}", headers=auth_headers)


def test_task_throughput_counts_completed_work_per_week(
    client: TestClient, auth_headers: dict, require_db: None
) -> None:
    """The reading arrives without anyone typing it."""
    owner = auth_headers
    areas: list[str] = []
    tasks: list[str] = []
    metrics: list[str] = []
    try:
        area = _post(client, owner, "/areas", name=f"{MARK} area1")
        areas.append(area["id"])
        m = _post(
            client,
            owner,
            "/metrics",
            name=f"{MARK} throughput",
            entity_type="area",
            entity_id=area["id"],
            source="derived",
            derivation="task_throughput",
            unit="tasks/week",
        )
        metrics.append(m["id"])

        # A brand-new area has shipped nothing — but the window still exists, so
        # the series is a run of honest zeroes rather than an absence.
        series = client.get(f"/metrics/{m['id']}/series", headers=owner).json()
        assert len(series) == 26
        assert {p["value"] for p in series} == {0.0}

        # Completed *yesterday*, which lands in last week's bucket one day in
        # seven — so assert on the window's total and on which bucket moved,
        # rather than on "the last one". A test that only passes six days a week
        # is worse than no test.
        now = datetime.now(UTC)
        for i in range(3):
            t = _post(
                client,
                owner,
                "/tasks",
                title=f"{MARK} shipped {i}",
                area_id=area["id"],
                status="completed",
                completed_at=(now - timedelta(days=1)).isoformat(),
            )
            tasks.append(t["id"])

        series = client.get(f"/metrics/{m['id']}/series", headers=owner).json()
        assert sum(p["value"] for p in series) == 3.0, series[-3:]
        # Yesterday is in this week or the one before it, never further back.
        assert {p["value"] for p in series[-2:]} != {0.0}, series[-3:]

        # Nothing was written to metric_entries — the number is computed, and the
        # entries list stays empty because a derived metric has none.
        entries = client.get(f"/metrics/{m['id']}/entries", headers=owner).json()
        assert entries == []
    finally:
        for t in tasks:
            client.delete(f"/tasks/{t}", headers=owner)
        for mid in metrics:
            client.delete(f"/metrics/{mid}", headers=owner)
        for a in areas:
            client.delete(f"/areas/{a}", headers=owner)


def test_an_outcome_reads_a_derived_metric_like_any_other(
    client: TestClient, auth_headers: dict, require_db: None
) -> None:
    """The point of deriving: downstream can't tell, and shouldn't."""
    owner = auth_headers
    areas: list[str] = []
    tasks: list[str] = []
    metrics: list[str] = []
    outcomes: list[str] = []
    try:
        area = _post(client, owner, "/areas", name=f"{MARK} area2")
        areas.append(area["id"])
        m = _post(
            client,
            owner,
            "/metrics",
            name=f"{MARK} weekly ship rate",
            entity_type="area",
            entity_id=area["id"],
            source="derived",
            derivation="task_throughput",
            unit="tasks/week",
        )
        metrics.append(m["id"])
        o = _post(
            client,
            owner,
            "/outcomes",
            statement=f"{MARK} ship at least 2 things a week",
            kind="standard",
            entity_type="area",
            entity_id=area["id"],
            metric_id=m["id"],
            target_min=2,
        )
        outcomes.append(o["id"])

        # Nothing shipped this week: the claim is breached, not unmeasured.
        got = client.get(f"/outcomes/{o['id']}/evaluation", headers=owner).json()
        assert got["state"] == "breached"
        assert got["latest_value"] == 0.0

        # Stamped now, so the reading is in the current week whatever day it is —
        # the verdict reads the *latest* bucket, so this one can't drift across a
        # week boundary the way a back-dated completion would.
        for i in range(2):
            t = _post(
                client,
                owner,
                "/tasks",
                title=f"{MARK} done {i}",
                area_id=area["id"],
                status="completed",
                completed_at=datetime.now(UTC).isoformat(),
            )
            tasks.append(t["id"])

        got = client.get(f"/outcomes/{o['id']}/evaluation", headers=owner).json()
        assert got["state"] == "met"
        assert got["latest_value"] == 2.0
    finally:
        for t in tasks:
            client.delete(f"/tasks/{t}", headers=owner)
        for oid in outcomes:
            client.delete(f"/outcomes/{oid}", headers=owner)
        for mid in metrics:
            client.delete(f"/metrics/{mid}", headers=owner)
        for a in areas:
            client.delete(f"/areas/{a}", headers=owner)
