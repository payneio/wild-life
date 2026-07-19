"""Integration tests for atomic task claiming (needs the castle Postgres)."""

from fastapi.testclient import TestClient
from sqlalchemy import create_engine, text

from personal_api.config import settings

MARK = "ZZ-claim-test"


def _post(client: TestClient, headers: dict, path: str, **body: object) -> dict:
    r = client.post(path, headers=headers, json=body)
    assert r.status_code in (200, 201), (path, r.status_code, r.text)
    return r.json()


def _sql(stmt: str, **params: object) -> None:
    eng = create_engine(settings.sync_database_url)
    with eng.begin() as conn:
        conn.execute(text(stmt), params)
    eng.dispose()


def test_task_claim(client: TestClient, auth_headers: dict, require_db: None) -> None:
    owner = auth_headers
    made: dict[str, list[str]] = {"tasks": [], "people": [], "tok": []}
    try:
        person = _post(client, owner, "/people", name=f"{MARK} agent")
        made["people"].append(person["id"])
        task = _post(
            client, owner, "/tasks", title=f"{MARK} t", assignee_id=person["id"]
        )
        made["tasks"].append(task["id"])
        tid = task["id"]
        tok = _post(
            client,
            owner,
            "/admin/tokens",
            label=MARK,
            person_id=person["id"],
            role="worker",
        )
        made["tok"].append(tok["id"])
        wh = {"Authorization": f"Bearer {tok['token']}"}

        # worker (assignee) claims -> 200, records claimed_by
        r = client.post(f"/tasks/{tid}/claim", headers=wh)
        assert r.status_code == 200, r.text
        assert r.json()["claimed_by_id"] == person["id"]

        # a different identity (owner) cannot claim the active claim -> 409
        assert client.post(f"/tasks/{tid}/claim", headers=owner).status_code == 409
        # the same worker re-claiming is idempotent -> 200
        assert client.post(f"/tasks/{tid}/claim", headers=wh).status_code == 200

        # completing the task clears the claim
        r = client.patch(f"/tasks/{tid}", headers=wh, json={"status": "completed"})
        assert r.status_code == 200, r.text
        assert r.json()["claimed_by_id"] is None

        # reopen + re-claim, then verify a stale claim is reclaimable by another
        client.patch(f"/tasks/{tid}", headers=wh, json={"status": "in_progress"})
        assert client.post(f"/tasks/{tid}/claim", headers=wh).status_code == 200
        _sql(
            "update personal_api.tasks set claimed_at = now() - interval '30 min'"
            " where id = :id",
            id=tid,
        )
        # owner can now reclaim the stale claim -> 200
        assert client.post(f"/tasks/{tid}/claim", headers=owner).status_code == 200

        # release clears it
        assert client.post(f"/tasks/{tid}/release", headers=owner).status_code == 204
        got = client.get(f"/tasks/{tid}", headers=owner).json()
        assert got["claimed_by_id"] is None
    finally:
        for tid in made["tasks"]:
            client.delete(f"/tasks/{tid}", headers=owner)
        for pid in made["people"]:
            client.delete(f"/people/{pid}", headers=owner)
        if made["tok"]:
            _sql(
                "delete from personal_api.api_tokens where id = any(:ids)",
                ids=made["tok"],
            )
