"""Protocol status transitions ripple onto the medications they govern.

Covers the "completed course still shows on Today" bug: Today reads a
medication's own ``status``, so ending a protocol has to end the meds it
governs — while respecting meds shared with another live protocol and meds the
user deliberately keeps ``as_needed``. Needs the castle Postgres.
"""

from fastapi.testclient import TestClient

MARK = "ZZ-cascade-test"


def _post(client: TestClient, headers: dict, path: str, **body: object) -> dict:
    r = client.post(path, headers=headers, json=body)
    assert r.status_code in (200, 201), (path, r.status_code, r.text)
    return r.json()


def _patch(client: TestClient, headers: dict, path: str, **body: object) -> dict:
    r = client.patch(path, headers=headers, json=body)
    assert r.status_code == 200, (path, r.status_code, r.text)
    return r.json()


def _med(client: TestClient, headers: dict, med_id: str) -> dict:
    r = client.get(f"/medications/{med_id}", headers=headers)
    assert r.status_code == 200, r.text
    return r.json()


def test_protocol_cascade(
    client: TestClient, auth_headers: dict, require_db: None
) -> None:
    h = auth_headers
    made: dict[str, list[str]] = {"protocols": [], "items": [], "meds": []}
    try:
        # Two active meds prescribed by one protocol, plus a PRN supplement.
        rif = _post(
            client,
            h,
            "/medications",
            name=f"{MARK} rifaximin",
            med_type="prescription",
            status="active",
        )
        neo = _post(
            client,
            h,
            "/medications",
            name=f"{MARK} neomycin",
            med_type="prescription",
            status="active",
        )
        prn = _post(
            client,
            h,
            "/medications",
            name=f"{MARK} oregano",
            med_type="supplement",
            status="as_needed",
        )
        made["meds"] += [rif["id"], neo["id"], prn["id"]]

        proto = _post(
            client,
            h,
            "/protocols",
            name=f"{MARK} antibiotic",
            status="active",
            end_date="2025-08-25",
        )
        made["protocols"].append(proto["id"])
        for med_id in (rif["id"], neo["id"], prn["id"]):
            it = _post(
                client,
                h,
                "/routines",
                protocol_id=proto["id"],
                medication_id=med_id,
            )
            made["items"].append(it["id"])

        # Complete the protocol -> its active meds end (stamped with the
        # protocol's end_date); the as_needed supplement is left alone.
        _patch(client, h, f"/protocols/{proto['id']}", status="completed")
        assert _med(client, h, rif["id"])["status"] == "completed"
        assert _med(client, h, rif["id"])["end_date"] == "2025-08-25"
        assert _med(client, h, neo["id"])["status"] == "completed"
        assert _med(client, h, prn["id"])["status"] == "as_needed"  # untouched

        # Re-activating the protocol brings the parked meds back.
        _patch(client, h, f"/protocols/{proto['id']}", status="active")
        assert _med(client, h, rif["id"])["status"] == "active"
        assert _med(client, h, rif["id"])["end_date"] is None
        assert _med(client, h, neo["id"])["status"] == "active"

        # Shared med: a *second* active protocol also prescribes rifaximin.
        # Completing the first must NOT end it — the second still holds it.
        proto2 = _post(
            client, h, "/protocols", name=f"{MARK} maintenance", status="active"
        )
        made["protocols"].append(proto2["id"])
        it2 = _post(
            client,
            h,
            "/routines",
            protocol_id=proto2["id"],
            medication_id=rif["id"],
        )
        made["items"].append(it2["id"])

        _patch(client, h, f"/protocols/{proto['id']}", status="completed")
        assert _med(client, h, rif["id"])["status"] == "active"  # held by proto2
        assert _med(client, h, neo["id"])["status"] == "completed"  # only proto1

        # Pausing a protocol is not "ending" it — meds keep their own status.
        _patch(client, h, f"/protocols/{proto2['id']}", status="paused")
        assert _med(client, h, rif["id"])["status"] == "active"
    finally:
        for iid in made["items"]:
            client.delete(f"/routines/{iid}", headers=h)
        for pid in made["protocols"]:
            client.delete(f"/protocols/{pid}", headers=h)
        for mid in made["meds"]:
            client.delete(f"/medications/{mid}", headers=h)
