"""Intakes: the idempotent check-off vs. the self-contained taking event.

``/routines/{id}/complete`` is the scheduled checkbox — at most one row per
(routine, day, slot), re-check updates in place, pre-filled from the routine's dose.
``/intakes`` logs a real taking event — always inserts, carries its own
``amount``+``unit``, always names a ``medication_id``, and may have **no** routine
(un-prescribed). Needs the castle Postgres.
"""

from fastapi.testclient import TestClient

MARK = "ZZ-dose-test"


def _post(client: TestClient, headers: dict, path: str, **body: object) -> dict:
    r = client.post(path, headers=headers, json=body)
    assert r.status_code in (200, 201), (path, r.status_code, r.text)
    return r.json()


def _instances(client: TestClient, headers: dict, **filt: str) -> list:
    r = client.get(
        "/routine-instances", headers=headers, params={"limit": "100", **filt}
    )
    assert r.status_code == 200, r.text
    return r.json()


def test_intakes(client: TestClient, auth_headers: dict, require_db: None) -> None:
    h = auth_headers
    made: dict[str, list[str]] = {"routines": [], "protocols": [], "meds": []}
    try:
        med = _post(client, h, "/medications", name=f"{MARK} med")
        made["meds"].append(med["id"])
        proto = _post(client, h, "/protocols", name=f"{MARK} proto")
        made["protocols"].append(proto["id"])
        routine = _post(
            client,
            h,
            "/routines",
            protocol_id=proto["id"],
            medication_id=med["id"],
            timing=["morning"],
            amount=500,
            unit="mg",
        )
        rid = routine["id"]
        made["routines"].append(rid)

        # /complete is idempotent per (routine, day, slot) and records the prescribed
        # dose (amount + unit) and the medication on the intake.
        _post(client, h, f"/routines/{rid}/complete?on=2026-07-18&slot=morning")
        _post(client, h, f"/routines/{rid}/complete?on=2026-07-18&slot=morning")
        scheduled = _instances(client, h, routine_id__eq=rid, ad_hoc__eq="false")
        assert len(scheduled) == 1, scheduled
        assert scheduled[0]["amount"] == 500 and scheduled[0]["unit"] == "mg"
        assert scheduled[0]["medication_id"] == med["id"]

        # /intakes against a routine pre-fills amount/unit/medication, and always
        # inserts — two per day both stick, and a deviation amount is honoured.
        _post(
            client,
            h,
            "/intakes",
            routine_id=rid,
            scheduled_date="2026-07-17",
            completed_at="2026-07-17T15:30:00Z",
        )
        _post(
            client,
            h,
            "/intakes",
            routine_id=rid,
            amount=250,
            scheduled_date="2026-07-17",
        )
        ad_hoc = _instances(client, h, routine_id__eq=rid, ad_hoc__eq="true")
        assert len(ad_hoc) == 2, ad_hoc
        assert {float(d["amount"]) for d in ad_hoc} == {500.0, 250.0}
        assert all(
            d["unit"] == "mg" and d["medication_id"] == med["id"] for d in ad_hoc
        )

        # An UN-PRESCRIBED intake: no routine, self-contained medication + amount + unit.
        loose = _post(
            client,
            h,
            "/intakes",
            medication_id=med["id"],
            amount=200,
            unit="mg",
            scheduled_date="2026-07-16",
        )
        assert loose["routine_id"] is None
        assert loose["medication_id"] == med["id"]
        assert loose["amount"] == 200 and loose["unit"] == "mg"

        # All of this medication's intakes are queryable directly by medication_id
        # (prescribed check-off + deviations + un-prescribed) — 4 so far.
        by_med = _instances(client, h, medication_id__eq=med["id"])
        assert len(by_med) == 4, by_med

        # An intake with neither routine nor medication is rejected.
        bad = client.post("/intakes", headers=h, json={"amount": 1})
        assert bad.status_code == 422, bad.text
    finally:
        for rid in made["routines"]:
            client.delete(f"/routines/{rid}", headers=h)
        for pid in made["protocols"]:
            client.delete(f"/protocols/{pid}", headers=h)
        for mid in made["meds"]:
            client.delete(f"/medications/{mid}", headers=h)
