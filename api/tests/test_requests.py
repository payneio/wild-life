"""Integration tests for the Request inbox flow (needs the castle Postgres)."""

from fastapi.testclient import TestClient
from sqlalchemy import create_engine, text

from personal_api.config import settings

MARK = "ZZ-request-test"


def _post(client: TestClient, headers: dict, path: str, **body: object) -> dict:
    r = client.post(path, headers=headers, json=body)
    assert r.status_code in (200, 201), (path, r.status_code, r.text)
    return r.json()


def _cleanup_tokens(token_ids: list[str]) -> None:
    if not token_ids:
        return
    eng = create_engine(settings.sync_database_url)
    with eng.begin() as conn:
        conn.execute(
            text("delete from personal_api.api_tokens where id = any(:ids)"),
            {"ids": token_ids},
        )
    eng.dispose()


def test_request_inbox(
    client: TestClient, auth_headers: dict, require_db: None
) -> None:
    owner = auth_headers
    made: dict[str, list[str]] = {"people": [], "tok": [], "requests": []}
    try:
        a = _post(client, owner, "/people", name=f"{MARK} requester")
        b = _post(client, owner, "/people", name=f"{MARK} addressee")
        made["people"] += [a["id"], b["id"]]

        tok_a = _post(
            client,
            owner,
            "/admin/tokens",
            label=f"{MARK}-a",
            person_id=a["id"],
            role="worker",
        )
        tok_b = _post(
            client,
            owner,
            "/admin/tokens",
            label=f"{MARK}-b",
            person_id=b["id"],
            role="worker",
        )
        made["tok"] += [tok_a["id"], tok_b["id"]]
        ha = {"Authorization": f"Bearer {tok_a['token']}"}
        hb = {"Authorization": f"Bearer {tok_b['token']}"}

        # A (worker) raises a question addressed to B; requester auto-attributes to A.
        req = _post(
            client,
            ha,
            "/requests",
            subject=f"{MARK} need input",
            kind="question",
            addressee_id=b["id"],
        )
        made["requests"].append(req["id"])
        assert req["requester_id"] == a["id"]
        assert req["status"] == "open"

        # B's inbox shows it; A's does not (A is requester, not addressee).
        inbox_b = client.get("/requests/inbox", headers=hb)
        assert inbox_b.status_code == 200
        assert any(r["id"] == req["id"] for r in inbox_b.json())
        inbox_a = client.get("/requests/inbox", headers=ha).json()
        assert all(r["id"] != req["id"] for r in inbox_a)

        # A (requester, not addressee) cannot resolve.
        assert (
            client.post(
                f"/requests/{req['id']}/resolve", headers=ha, json={}
            ).status_code
            == 403
        )
        # B (addressee) resolves it.
        r = client.post(
            f"/requests/{req['id']}/resolve", headers=hb, json={"resolution": "done"}
        )
        assert r.status_code == 200, r.text
        assert r.json()["status"] == "resolved"
        assert r.json()["resolution"] == "done"

        # "waiting on others" is just a filter on the same table.
        lst = client.get(f"/requests?requester_id={a['id']}", headers=owner).json()
        assert any(x["id"] == req["id"] for x in lst)

        # workers cannot delete requests (coarse deny).
        assert client.delete(f"/requests/{req['id']}", headers=ha).status_code == 403
    finally:
        for rid in made["requests"]:
            client.delete(f"/requests/{rid}", headers=owner)
        for pid in made["people"]:
            client.delete(f"/people/{pid}", headers=owner)
        _cleanup_tokens(made["tok"])
