"""Evaluating an outcome — one rule per kind, and the honest states in between.

Needs the castle Postgres. Everything created here is prefixed with MARK and
deleted in a `finally`, since these run against the real database.
"""

from datetime import UTC, date, datetime, timedelta

from fastapi.testclient import TestClient

MARK = "ZZ-outcome-test"


def _post(client: TestClient, headers: dict, path: str, **body: object) -> dict:
    r = client.post(path, headers=headers, json=body)
    assert r.status_code in (200, 201), (path, r.status_code, r.text)
    return r.json()


def _evaluate(client: TestClient, headers: dict, outcome_id: str) -> dict:
    r = client.get(f"/outcomes/{outcome_id}/evaluation", headers=headers)
    assert r.status_code == 200, r.text
    return r.json()


def _cleanup(client: TestClient, headers: dict, kind: str, ids: list[str]) -> None:
    for i in ids:
        client.delete(f"/{kind}/{i}", headers=headers)


def test_standard_is_in_band_or_breached(
    client: TestClient, auth_headers: dict, require_db: None
) -> None:
    """A standard has no deadline and no progress — it holds or it doesn't."""
    owner = auth_headers
    areas: list[str] = []
    metrics: list[str] = []
    outcomes: list[str] = []
    try:
        area = _post(client, owner, "/areas", name=f"{MARK} area")
        areas.append(area["id"])
        m = _post(
            client,
            owner,
            "/metrics",
            name=f"{MARK} systolic",
            entity_type="area",
            entity_id=area["id"],
            unit="mmHg",
            reference_min=90,
            reference_max=130,
        )
        metrics.append(m["id"])
        o = _post(
            client,
            owner,
            "/outcomes",
            statement=f"{MARK} blood pressure in range",
            kind="standard",
            entity_type="area",
            entity_id=area["id"],
            metric_id=m["id"],
            target_min=90,
            target_max=130,
        )
        outcomes.append(o["id"])

        # Bound to an instrument that has never been read — not the same thing as
        # having no instrument.
        assert _evaluate(client, owner, o["id"])["state"] == "no_readings"

        _post(
            client,
            owner,
            "/metric-entries",
            metric_id=m["id"],
            value=118,
            recorded_at=datetime.now(UTC).isoformat(),
        )
        got = _evaluate(client, owner, o["id"])
        assert got["state"] == "met"
        assert got["latest_value"] == 118
        # The world's band rides along, so a surface can draw both.
        assert (got["reference_min"], got["reference_max"]) == (90, 130)

        _post(
            client,
            owner,
            "/metric-entries",
            metric_id=m["id"],
            value=147,
            recorded_at=(datetime.now(UTC) + timedelta(minutes=1)).isoformat(),
        )
        assert _evaluate(client, owner, o["id"])["state"] == "breached"
    finally:
        _cleanup(client, owner, "outcomes", outcomes)
        _cleanup(client, owner, "metrics", metrics)
        _cleanup(client, owner, "areas", areas)


def test_one_sided_band_only_constrains_its_side(
    client: TestClient, auth_headers: dict, require_db: None
) -> None:
    """ "Under 100" is a ceiling alone — zero is not a breach."""
    owner = auth_headers
    areas: list[str] = []
    metrics: list[str] = []
    outcomes: list[str] = []
    try:
        area = _post(client, owner, "/areas", name=f"{MARK} area2")
        areas.append(area["id"])
        m = _post(
            client,
            owner,
            "/metrics",
            name=f"{MARK} ldl",
            entity_type="area",
            entity_id=area["id"],
            unit="mg/dL",
        )
        metrics.append(m["id"])
        o = _post(
            client,
            owner,
            "/outcomes",
            statement=f"{MARK} LDL under 100",
            kind="standard",
            entity_type="area",
            entity_id=area["id"],
            metric_id=m["id"],
            target_max=100,
        )
        outcomes.append(o["id"])
        _post(
            client,
            owner,
            "/metric-entries",
            metric_id=m["id"],
            value=4,
            recorded_at=datetime.now(UTC).isoformat(),
        )
        assert _evaluate(client, owner, o["id"])["state"] == "met"
    finally:
        _cleanup(client, owner, "outcomes", outcomes)
        _cleanup(client, owner, "metrics", metrics)
        _cleanup(client, owner, "areas", areas)


def test_target_progresses_downward_and_can_be_overdue(
    client: TestClient, auth_headers: dict, require_db: None
) -> None:
    """Falling towards a ceiling counts as progress — 330 → 100 is 0% to 100%."""
    owner = auth_headers
    areas: list[str] = []
    metrics: list[str] = []
    outcomes: list[str] = []
    try:
        area = _post(client, owner, "/areas", name=f"{MARK} area3")
        areas.append(area["id"])
        m = _post(
            client,
            owner,
            "/metrics",
            name=f"{MARK} trig",
            entity_type="area",
            entity_id=area["id"],
            unit="mg/dL",
        )
        metrics.append(m["id"])
        o = _post(
            client,
            owner,
            "/outcomes",
            statement=f"{MARK} triglycerides under 100",
            kind="target",
            entity_type="area",
            entity_id=area["id"],
            metric_id=m["id"],
            target_max=100,
            baseline=330,
            by_when=(date.today() + timedelta(days=60)).isoformat(),
        )
        outcomes.append(o["id"])
        _post(
            client,
            owner,
            "/metric-entries",
            metric_id=m["id"],
            value=215,
            recorded_at=datetime.now(UTC).isoformat(),
        )
        got = _evaluate(client, owner, o["id"])
        assert got["progress"] == 50.0
        assert got["state"] in ("on_pace", "behind")
        assert got["days_remaining"] == 60

        # Arriving inside the band is achieved, whatever the clock says.
        _post(
            client,
            owner,
            "/metric-entries",
            metric_id=m["id"],
            value=92,
            recorded_at=(datetime.now(UTC) + timedelta(minutes=1)).isoformat(),
        )
        got = _evaluate(client, owner, o["id"])
        assert got["state"] == "achieved"
        assert got["progress"] == 100.0

        # Past its date and not there yet.
        client.patch(
            f"/outcomes/{o['id']}",
            headers=owner,
            json={"by_when": (date.today() - timedelta(days=1)).isoformat()},
        )
        _post(
            client,
            owner,
            "/metric-entries",
            metric_id=m["id"],
            value=300,
            recorded_at=(datetime.now(UTC) + timedelta(minutes=2)).isoformat(),
        )
        got = _evaluate(client, owner, o["id"])
        assert got["state"] == "overdue"
        assert got["days_remaining"] == -1
    finally:
        _cleanup(client, owner, "outcomes", outcomes)
        _cleanup(client, owner, "metrics", metrics)
        _cleanup(client, owner, "areas", areas)


def test_unmeasured_is_a_first_class_state(
    client: TestClient, auth_headers: dict, require_db: None
) -> None:
    """An outcome with no metric is a legitimate state, not an error.

    That's the whole gradient from aspiration to specific: you can say what must
    be true before you can say how you'd read it.
    """
    owner = auth_headers
    areas: list[str] = []
    outcomes: list[str] = []
    try:
        area = _post(client, owner, "/areas", name=f"{MARK} area4")
        areas.append(area["id"])
        aspiration = _post(
            client,
            owner,
            "/outcomes",
            statement=f"{MARK} sleep better",
            kind="standard",
            entity_type="area",
            entity_id=area["id"],
        )
        outcomes.append(aspiration["id"])
        assert _evaluate(client, owner, aspiration["id"])["state"] == "unmeasured"
    finally:
        _cleanup(client, owner, "outcomes", outcomes)
        _cleanup(client, owner, "areas", areas)


def test_deliverable_is_no_longer_a_kind(
    client: TestClient, auth_headers: dict, require_db: None
) -> None:
    """It restated its root: every one was on a project, and the "Done when"
    panel defaulted the kind by rung, so the app manufactured the correlation.
    A project's completion is its tasks and its status."""
    r = client.post(
        "/outcomes",
        json={"statement": f"{MARK} rejected", "kind": "deliverable"},
        headers=auth_headers,
    )
    assert r.status_code == 422


def test_a_reading_past_its_cadence_is_stale(
    client: TestClient, auth_headers: dict, require_db: None
) -> None:
    """The lipid panel that sat 17 months should not read as a live verdict."""
    owner = auth_headers
    areas: list[str] = []
    metrics: list[str] = []
    outcomes: list[str] = []
    try:
        area = _post(client, owner, "/areas", name=f"{MARK} area5")
        areas.append(area["id"])
        m = _post(
            client,
            owner,
            "/metrics",
            name=f"{MARK} panel",
            entity_type="area",
            entity_id=area["id"],
            unit="mg/dL",
            measurement_frequency="quarterly",
        )
        metrics.append(m["id"])
        o = _post(
            client,
            owner,
            "/outcomes",
            statement=f"{MARK} panel in range",
            kind="standard",
            entity_type="area",
            entity_id=area["id"],
            metric_id=m["id"],
            target_max=200,
        )
        outcomes.append(o["id"])
        _post(
            client,
            owner,
            "/metric-entries",
            metric_id=m["id"],
            value=150,
            recorded_at=(datetime.now(UTC) - timedelta(days=500)).isoformat(),
        )
        got = _evaluate(client, owner, o["id"])
        assert got["state"] == "met"
        assert got["is_stale"] is True
    finally:
        _cleanup(client, owner, "outcomes", outcomes)
        _cleanup(client, owner, "metrics", metrics)
        _cleanup(client, owner, "areas", areas)
