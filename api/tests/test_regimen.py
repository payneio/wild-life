"""The derived daily regimen: dose lines drive Today, not a hand-synced column.

A dose line attached to a protocol is in force only while that protocol is
active and in-window; a protocol-less ("standing") line follows the medication.
On top of that each line carries an FHIR-style cadence (days-of-week, every-N-
days) and a PRN flag. Needs the castle Postgres.
"""

from datetime import date

from fastapi.testclient import TestClient

MARK = "ZZ-regimen-test"
_WD = ("mon", "tue", "wed", "thu", "fri", "sat", "sun")


def _post(client: TestClient, headers: dict, path: str, **body: object) -> dict:
    r = client.post(path, headers=headers, json=body)
    assert r.status_code in (200, 201), (path, r.status_code, r.text)
    return r.json()


def _regimen(client: TestClient, headers: dict, day: str) -> list[dict]:
    r = client.get(f"/regimen?date={day}", headers=headers)
    assert r.status_code == 200, r.text
    return r.json()


def _slots(regimen: list[dict], med_id: str) -> set[str]:
    return {d["slot"] for d in regimen if d["medication_id"] == med_id}


def test_regimen_derivation(
    client: TestClient, auth_headers: dict, require_db: None
) -> None:
    h = auth_headers
    today = "2026-07-18"
    made: dict[str, list[str]] = {"protocols": [], "items": [], "meds": []}
    try:
        vitamin = _post(
            client,
            h,
            "/medications",
            name=f"{MARK} vitamin",
            status="active",
            form="tablet",
        )
        drug = _post(client, h, "/medications", name=f"{MARK} drug", status="active")
        made["meds"] += [vitamin["id"], drug["id"]]

        # A standing (protocol-less) dose line follows the medication itself, and
        # surfaces its numeric amount + the med's form.
        standing = _post(
            client,
            h,
            "/routines",
            medication_id=vitamin["id"],
            timing=["breakfast"],
            amount=2,
        )
        made["items"].append(standing["id"])
        reg = _regimen(client, h, today)
        assert _slots(reg, vitamin["id"]) == {"breakfast"}
        row = next(d for d in reg if d["medication_id"] == vitamin["id"])
        assert row["amount"] == 2 and row["form"] == "tablet"

        # A dose line attached to an ACTIVE protocol shows...
        proto = _post(client, h, "/protocols", name=f"{MARK} course", status="active")
        made["protocols"].append(proto["id"])
        it = _post(
            client,
            h,
            "/routines",
            protocol_id=proto["id"],
            medication_id=drug["id"],
            timing=["wake", "bedtime"],
            amount=1,
        )
        made["items"].append(it["id"])
        assert _slots(_regimen(client, h, today), drug["id"]) == {"wake", "bedtime"}

        # ...and completing the protocol takes it off Today — no med edit needed.
        r = client.patch(
            f"/protocols/{proto['id']}", headers=h, json={"status": "completed"}
        )
        assert r.status_code == 200, r.text
        assert _slots(_regimen(client, h, today), drug["id"]) == set()
        assert _slots(_regimen(client, h, today), vitamin["id"]) == {"breakfast"}
        client.patch(f"/protocols/{proto['id']}", headers=h, json={"status": "active"})

        # A window in the past hides a standing line even with the med active.
        client.patch(
            f"/medications/{vitamin['id']}", headers=h, json={"end_date": "2020-01-01"}
        )
        assert _slots(_regimen(client, h, today), vitamin["id"]) == set()
    finally:
        for iid in made["items"]:
            client.delete(f"/routines/{iid}", headers=h)
        for pid in made["protocols"]:
            client.delete(f"/protocols/{pid}", headers=h)
        for mid in made["meds"]:
            client.delete(f"/medications/{mid}", headers=h)


def test_regimen_cadence(
    client: TestClient, auth_headers: dict, require_db: None
) -> None:
    """days-of-week, every-N-days, and PRN each gate a dose off Today correctly."""
    h = auth_headers
    d0 = date(2026, 7, 18)  # anchor
    today = d0.isoformat()
    plus1 = date(2026, 7, 19).isoformat()
    plus2 = date(2026, 7, 20).isoformat()
    this_wd, other_wd = _WD[d0.weekday()], _WD[(d0.weekday() + 1) % 7]
    made: dict[str, list[str]] = {"items": [], "meds": []}
    try:
        med = _post(
            client,
            h,
            "/medications",
            name=f"{MARK} cad",
            status="active",
            start_date=today,
        )
        made["meds"].append(med["id"])

        # days_of_week: shows on its weekday, hidden on others.
        dow = _post(
            client,
            h,
            "/routines",
            medication_id=med["id"],
            timing=["wake"],
            days_of_week=[this_wd],
        )
        made["items"].append(dow["id"])
        assert _slots(_regimen(client, h, today), med["id"]) == {"wake"}
        client.patch(
            f"/routines/{dow['id']}", headers=h, json={"days_of_week": [other_wd]}
        )
        assert _slots(_regimen(client, h, today), med["id"]) == set()
        client.delete(f"/routines/{dow['id']}", headers=h)

        # interval_days=2 anchored at the med's start: due on d0 and d0+2, not d0+1.
        every_other = _post(
            client,
            h,
            "/routines",
            medication_id=med["id"],
            timing=["wake"],
            interval_days=2,
        )
        made["items"].append(every_other["id"])
        assert _slots(_regimen(client, h, today), med["id"]) == {"wake"}
        assert _slots(_regimen(client, h, plus1), med["id"]) == set()
        assert _slots(_regimen(client, h, plus2), med["id"]) == {"wake"}

        # as_needed (PRN) is never on the scheduled list.
        client.patch(
            f"/routines/{every_other['id']}",
            headers=h,
            json={"interval_days": 1, "as_needed": True},
        )
        assert _slots(_regimen(client, h, today), med["id"]) == set()
    finally:
        for iid in made["items"]:
            client.delete(f"/routines/{iid}", headers=h)
        for mid in made["meds"]:
            client.delete(f"/medications/{mid}", headers=h)
