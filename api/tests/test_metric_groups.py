"""Metric groups: one act, several values, and ratios that pair by occasion.

The two things worth pinning are the ones the design turns on: recording a
reading is *atomic* (one moment, not five that happen to be close), and a ratio
is computed per occasion rather than guessed from nearby timestamps.
"""

from collections.abc import Generator

import pytest
from fastapi.testclient import TestClient

MARK = "ZZ-mg"


@pytest.fixture
def area_id(
    client: TestClient, auth_headers: dict[str, str], require_db: None
) -> Generator[str, None, None]:
    r = client.post("/areas", json={"name": f"{MARK} area"}, headers=auth_headers)
    assert r.status_code == 201, r.text
    yield r.json()["id"]
    client.delete(f"/areas/{r.json()['id']}", headers=auth_headers)


@pytest.fixture
def lipids(
    client: TestClient, auth_headers: dict[str, str], area_id: str
) -> Generator[dict[str, str], None, None]:
    """A group of two metrics, plus a ratio derived from them."""
    made: dict[str, str] = {}
    for name in ("chol", "hdl"):
        r = client.post(
            "/metrics",
            json={
                "name": f"{MARK} {name}",
                "entity_type": "area",
                "entity_id": area_id,
                "unit": "mg/dL",
            },
            headers=auth_headers,
        )
        assert r.status_code == 201, r.text
        made[name] = r.json()["id"]

    r = client.post(
        "/metrics",
        json={
            "name": f"{MARK} chol/hdl",
            "entity_type": "area",
            "entity_id": area_id,
            "source": "derived",
            "derivation": "ratio",
            "numerator_metric_id": made["chol"],
            "denominator_metric_id": made["hdl"],
        },
        headers=auth_headers,
    )
    assert r.status_code == 201, r.text
    made["ratio"] = r.json()["id"]

    r = client.post(
        "/metric-groups",
        json={"name": f"{MARK} lipids", "entity_type": "area", "entity_id": area_id},
        headers=auth_headers,
    )
    assert r.status_code == 201, r.text
    made["group"] = r.json()["id"]
    client.put(
        f"/metric-groups/{made['group']}/members",
        json={"metric_ids": [made["chol"], made["hdl"]]},
        headers=auth_headers,
    )

    yield made
    client.delete(f"/metric-groups/{made['group']}", headers=auth_headers)
    for k in ("ratio", "chol", "hdl"):
        client.delete(f"/metrics/{made[k]}", headers=auth_headers)


class TestRecordingIsOneAct:
    def test_one_request_writes_one_moment(
        self, client: TestClient, auth_headers: dict[str, str], lipids: dict[str, str]
    ) -> None:
        """Five values entered separately produced five timestamps that ought to
        have been one. The whole point is that they no longer can."""
        at = "2025-02-25T09:00:00Z"
        r = client.post(
            f"/metric-groups/{lipids['group']}/readings",
            json={
                "recorded_at": at,
                "context": "fasting",
                "values": [
                    {"metric_id": lipids["chol"], "value": 350},
                    {"metric_id": lipids["hdl"], "value": 42},
                ],
            },
            headers=auth_headers,
        )
        assert r.status_code == 201, r.text
        assert r.json()["context"] == "fasting"
        assert len(r.json()["entries"]) == 2

        readings = client.get(
            f"/metric-groups/{lipids['group']}/readings", headers=auth_headers
        ).json()
        assert len(readings) == 1
        stamps = {
            e["recorded_at"]
            for m in ("chol", "hdl")
            for e in client.get(
                f"/metrics/{lipids[m]}/entries", headers=auth_headers
            ).json()
        }
        assert len(stamps) == 1, stamps

    def test_a_partial_reading_is_legal(
        self, client: TestClient, auth_headers: dict[str, str], lipids: dict[str, str]
    ) -> None:
        """A metabolic panel came back with one of fourteen. Requiring the full
        membership would have failed on the first import."""
        r = client.post(
            f"/metric-groups/{lipids['group']}/readings",
            json={
                "recorded_at": "2025-03-01T09:00:00Z",
                "values": [{"metric_id": lipids["chol"], "value": 300}],
            },
            headers=auth_headers,
        )
        assert r.status_code == 201
        assert len(r.json()["entries"]) == 1


class TestRatiosPairByOccasion:
    def test_computes_per_reading_and_skips_half_readings(
        self, client: TestClient, auth_headers: dict[str, str], lipids: dict[str, str]
    ) -> None:
        """The bug this replaces: the source sheet stored TRI/HDL = 120 on a draw
        with no triglycerides. A derived point can only exist where both operands
        do."""
        client.post(
            f"/metric-groups/{lipids['group']}/readings",
            json={
                "recorded_at": "2025-02-25T09:00:00Z",
                "values": [
                    {"metric_id": lipids["chol"], "value": 350},
                    {"metric_id": lipids["hdl"], "value": 50},
                ],
            },
            headers=auth_headers,
        )
        # A draw where only the denominator came back — no ratio is knowable.
        client.post(
            f"/metric-groups/{lipids['group']}/readings",
            json={
                "recorded_at": "2025-05-30T09:00:00Z",
                "values": [{"metric_id": lipids["hdl"], "value": 36}],
            },
            headers=auth_headers,
        )

        series = client.get(
            f"/metrics/{lipids['ratio']}/series", headers=auth_headers
        ).json()
        assert len(series) == 1, series
        assert series[0]["value"] == pytest.approx(7.0)

    def test_a_derived_metric_has_no_entries_of_its_own(
        self, client: TestClient, auth_headers: dict[str, str], lipids: dict[str, str]
    ) -> None:
        entries = client.get(
            f"/metrics/{lipids['ratio']}/entries", headers=auth_headers
        ).json()
        assert entries == []


class TestOperandValidation:
    def test_a_ratio_must_name_both_operands(
        self, client: TestClient, auth_headers: dict[str, str], area_id: str
    ) -> None:
        r = client.post(
            "/metrics",
            json={
                "name": f"{MARK} bad ratio",
                "entity_type": "area",
                "entity_id": area_id,
                "source": "derived",
                "derivation": "ratio",
            },
            headers=auth_headers,
        )
        assert r.status_code == 422

    def test_only_ratios_take_operands(
        self, client: TestClient, auth_headers: dict[str, str], area_id: str
    ) -> None:
        """An operand on a computation that ignores it is a lie about where the
        number comes from."""
        r = client.post(
            "/metrics",
            json={
                "name": f"{MARK} bad throughput",
                "entity_type": "area",
                "entity_id": area_id,
                "source": "derived",
                "derivation": "task_throughput",
                "numerator_metric_id": "00000000-0000-0000-0000-000000000001",
                "denominator_metric_id": "00000000-0000-0000-0000-000000000002",
            },
            headers=auth_headers,
        )
        assert r.status_code == 422


class TestMembership:
    def test_setting_members_replaces_and_renumbers(
        self, client: TestClient, auth_headers: dict[str, str], lipids: dict[str, str]
    ) -> None:
        client.put(
            f"/metric-groups/{lipids['group']}/members",
            json={"metric_ids": [lipids["hdl"], lipids["chol"]]},
            headers=auth_headers,
        )
        members = client.get(
            "/group-members",
            params={"group_id": lipids["group"], "sort": "position"},
            headers=auth_headers,
        ).json()
        assert [m["metric_id"] for m in members] == [lipids["hdl"], lipids["chol"]]
        assert [m["position"] for m in members] == [0, 1]
