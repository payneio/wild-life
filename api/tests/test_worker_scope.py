"""Integration tests for worker scope authorization (needs the castle Postgres).

Exercises the full stack — auth middleware, token registry, scope resolution — via
the real app + DB. Skips cleanly when the database isn't reachable. All rows created
here are namespaced with a marker and removed in teardown.
"""

from fastapi.testclient import TestClient
from sqlalchemy import create_engine, text

from personal_api.config import settings

MARK = "ZZ-worker-scope-test"


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


def test_worker_scope(client: TestClient, auth_headers: dict, require_db: None) -> None:
    owner = auth_headers
    made: dict[str, list[str]] = {"tasks": [], "projects": [], "people": [], "tok": []}
    try:
        person = _post(client, owner, "/people", name=f"{MARK} assistant")
        made["people"].append(person["id"])

        project = _post(
            client,
            owner,
            "/projects",
            name=f"{MARK} project",
            responsible_lead_id=person["id"],
        )
        made["projects"].append(project["id"])

        t_in = _post(
            client, owner, "/tasks", title=f"{MARK} in", project_id=project["id"]
        )
        made["tasks"].append(t_in["id"])
        t_out = _post(client, owner, "/tasks", title=f"{MARK} out")
        made["tasks"].append(t_out["id"])

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

        # read-all
        assert client.get("/tasks", headers=wh).status_code == 200
        assert client.get("/projects", headers=wh).status_code == 200

        # update in-scope task (allowed field) -> ok
        r = client.patch(
            f"/tasks/{t_in['id']}", headers=wh, json={"status": "in_progress"}
        )
        assert r.status_code == 200, r.text
        assert r.json()["status"] == "in_progress"

        # update out-of-scope task -> 403
        r = client.patch(
            f"/tasks/{t_out['id']}", headers=wh, json={"status": "in_progress"}
        )
        assert r.status_code == 403, r.text

        # reassign (disallowed field) even in scope -> 403
        r = client.patch(
            f"/tasks/{t_in['id']}", headers=wh, json={"assignee_id": person["id"]}
        )
        assert r.status_code == 403, r.text

        # create inside owned project -> allowed (may assign within scope)
        child = _post(
            client, wh, "/tasks", title=f"{MARK} child", project_id=project["id"]
        )
        made["tasks"].append(child["id"])

        # create with no scope -> assignee forced to self
        own = _post(client, wh, "/tasks", title=f"{MARK} own")
        made["tasks"].append(own["id"])
        assert own["assignee_id"] == person["id"]

        # coarse denials
        assert client.delete(f"/tasks/{t_in['id']}", headers=wh).status_code == 403
        assert (
            client.post("/projects", headers=wh, json={"name": "nope"}).status_code
            == 403
        )
    finally:
        for tid in made["tasks"]:
            client.delete(f"/tasks/{tid}", headers=owner)
        for pid in made["projects"]:
            client.delete(f"/projects/{pid}", headers=owner)
        for pid in made["people"]:
            client.delete(f"/people/{pid}", headers=owner)
        _cleanup_tokens(made["tok"])


def _ids(client: TestClient, headers: dict, path: str) -> set[str]:
    r = client.get(path, headers=headers)
    assert r.status_code == 200, r.text
    return {t["id"] for t in r.json()}


def test_actionable_queue(
    client: TestClient, auth_headers: dict, require_db: None
) -> None:
    """tasks_mine is the *actionable* queue: assigned-to-me + unassigned-at-tightest-
    scope-I-directly-own. A task assigned to another agent is never in my queue, even
    if it's within my authority scope."""
    owner = auth_headers
    m: dict[str, list[str]] = {
        "tasks": [],
        "projects": [],
        "areas": [],
        "people": [],
        "tok": [],
    }
    try:
        planner = _post(client, owner, "/people", name=f"{MARK} planner")
        coder = _post(client, owner, "/people", name=f"{MARK} coder")
        m["people"] += [planner["id"], coder["id"]]

        # Planner owns the AREA; Coder owns the PROJECT inside it (tightest owner).
        area = _post(
            client,
            owner,
            "/areas",
            name=f"{MARK} area",
            accountable_owner_id=planner["id"],
        )
        m["areas"].append(area["id"])
        proj = _post(
            client,
            owner,
            "/projects",
            name=f"{MARK} proj",
            area_id=area["id"],
            accountable_owner_id=coder["id"],
            responsible_lead_id=coder["id"],
        )
        m["projects"].append(proj["id"])

        t_coder = _post(
            client,
            owner,
            "/tasks",
            title=f"{MARK} assigned-coder",
            assignee_id=coder["id"],
            project_id=proj["id"],
        )
        t_planner = _post(
            client,
            owner,
            "/tasks",
            title=f"{MARK} assigned-planner",
            assignee_id=planner["id"],
        )
        t_area = _post(
            client, owner, "/tasks", title=f"{MARK} unassigned-area", area_id=area["id"]
        )
        t_proj = _post(
            client,
            owner,
            "/tasks",
            title=f"{MARK} unassigned-proj",
            project_id=proj["id"],
        )
        t_wait = _post(
            client,
            owner,
            "/tasks",
            title=f"{MARK} blocked",
            assignee_id=planner["id"],
            status="waiting",
        )
        m["tasks"] += [
            t_coder["id"],
            t_planner["id"],
            t_area["id"],
            t_proj["id"],
            t_wait["id"],
        ]

        ptok = _post(
            client,
            owner,
            "/admin/tokens",
            label=f"{MARK}-p",
            person_id=planner["id"],
            role="worker",
        )
        ctok = _post(
            client,
            owner,
            "/admin/tokens",
            label=f"{MARK}-c",
            person_id=coder["id"],
            role="worker",
        )
        m["tok"] += [ptok["id"], ctok["id"]]
        ph = {"Authorization": f"Bearer {ptok['token']}"}
        ch = {"Authorization": f"Bearer {ctok['token']}"}

        planner_q = _ids(client, ph, "/tasks/mine")
        coder_q = _ids(client, ch, "/tasks/mine")

        # the bug: a task delegated to the Coder must NOT be in the Planner's queue
        assert t_coder["id"] not in planner_q
        assert t_coder["id"] in coder_q
        # assigned-to-me shows for the assignee
        assert t_planner["id"] in planner_q
        # unassigned triage routes to the tightest direct owner
        assert t_area["id"] in planner_q and t_area["id"] not in coder_q
        assert t_proj["id"] in coder_q and t_proj["id"] not in planner_q
        # a 'waiting' (blocked) task is not actionable, even though assigned to me
        assert t_wait["id"] not in planner_q

        # authority unchanged: the Planner may still write the Coder's task (oversight)
        r = client.patch(
            f"/tasks/{t_coder['id']}", headers=ph, json={"status": "in_progress"}
        )
        assert r.status_code == 200, r.text
    finally:
        for tid in m["tasks"]:
            client.delete(f"/tasks/{tid}", headers=owner)
        for pid in m["projects"]:
            client.delete(f"/projects/{pid}", headers=owner)
        for aid in m["areas"]:
            client.delete(f"/areas/{aid}", headers=owner)
        for pid in m["people"]:
            client.delete(f"/people/{pid}", headers=owner)
        _cleanup_tokens(m["tok"])
