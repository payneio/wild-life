"""The three defects the skill evaluation surfaced, pinned (needs castle Postgres).

Each was invisible for the same reason: a value was written to one column and
read from another, and the two happened to agree on every existing row — so
nothing diverged and nothing failed. These tests make the divergence explicit.
"""

import uuid
from datetime import date, timedelta

from fastapi.testclient import TestClient
from sqlalchemy import create_engine, text

from wild_life.config import settings
from wild_life.identity import registry

MARK = "ZZ-assignment-routing"


def _post(client: TestClient, headers: dict, path: str, **body: object) -> dict:
    r = client.post(path, headers=headers, json=body)
    assert r.status_code in (200, 201), (path, r.status_code, r.text)
    return r.json()


def _sweep(**ids: list[str]) -> None:
    eng = create_engine(settings.sync_database_url)
    with eng.begin() as conn:
        for table, rows in ids.items():
            for r in rows:
                conn.execute(
                    text(f"DELETE FROM wild_life.{table} WHERE id = :i"), {"i": r}
                )
    eng.dispose()


def test_accepting_an_assignment_queues_the_work(
    client: TestClient, auth_headers: dict, require_db: None
) -> None:
    """`POST /tasks/{id}/assignment` moves *responsible*; `/tasks/mine` must see it.

    Delegation moves Responsible and never Accountable, so the endpoint writes
    `responsible_id`. The actionable queue read only `assignee_id`, which meant
    accepting an assignment queued the task for nobody. Every task in the corpus
    has assignee == responsible, so the two never disagreed and the gap was
    unobservable until something wrote one without the other.
    """
    owner = auth_headers
    made: dict[str, list[str]] = {"tasks": [], "people": []}
    original_self = settings.self_person_id
    try:
        me = _post(client, owner, "/people", name=f"{MARK} self")
        made["people"].append(me["id"])
        registry.set_owner(settings.token, uuid.UUID(me["id"]))

        # Deliberately no assignee: responsibility arrives only via the endpoint.
        task = _post(client, owner, "/tasks", title=f"{MARK} delegated")
        made["tasks"].append(task["id"])
        assert task["assignee_id"] is None

        accepted = _post(
            client,
            owner,
            f"/tasks/{task['id']}/assignment",
            event="accepted",
            person_id=me["id"],
        )
        assert accepted["responsible_id"] == me["id"]
        assert accepted["assignee_id"] is None, (
            "the endpoint moves responsible only — if this changes, the read "
            "below is no longer testing what it was written for"
        )

        mine = client.get("/tasks/mine", headers=owner).json()
        assert task["id"] in {t["id"] for t in mine}, (
            "a task I accepted responsibility for is not in my actionable queue"
        )
    finally:
        registry.set_owner(settings.token, original_self)
        _sweep(**made)


def test_advanced_by_counts_the_edge_that_has_a_writer(
    client: TestClient, auth_headers: dict, require_db: None
) -> None:
    """An outcome's `advanced_by` counts `task_objectives`, the real means-end edge.

    It counted `entity_links(relation='advances')`, which nothing in the
    repository has ever written, so the number was structurally always zero —
    a value that cannot be wrong because it cannot be anything.

    Contribution is still not satisfaction: this counts effort aimed at the
    claim and must not move `state`.
    """
    owner = auth_headers
    made: dict[str, list[str]] = {"tasks": [], "outcomes": [], "areas": []}
    try:
        area = _post(client, owner, "/areas", name=f"{MARK} area")
        made["areas"].append(area["id"])
        outcome = _post(
            client,
            owner,
            "/outcomes",
            statement=f"{MARK} claim",
            kind="standard",
            entity_type="area",
            entity_id=area["id"],
        )
        made["outcomes"].append(outcome["id"])

        before = client.get(
            f"/outcomes/{outcome['id']}/evaluation", headers=owner
        ).json()
        assert before["advanced_by"] == 0

        task = _post(client, owner, "/tasks", title=f"{MARK} means")
        made["tasks"].append(task["id"])
        served = client.put(
            f"/tasks/{task['id']}/objectives/{outcome['id']}", headers=owner
        )
        assert served.status_code == 204, served.text

        after = client.get(
            f"/outcomes/{outcome['id']}/evaluation", headers=owner
        ).json()
        assert after["advanced_by"] == 1, (
            "serving an outcome did not register — advanced_by is reading an "
            "edge nothing writes"
        )
        assert after["state"] == before["state"], (
            "contribution is not satisfaction: a task serving the claim must "
            "not change whether the claim holds"
        )
    finally:
        _sweep(**made)


def test_recurrence_carries_both_ends_of_the_window(
    client: TestClient, auth_headers: dict, require_db: None
) -> None:
    """Completing a recurring task shifts `not_before` with `due_date`.

    `not_before` was added to `tasks` after `_spawn_next_occurrence` was written
    and was not carried, so each cycle dropped the earliest-start bound and the
    next occurrence became available immediately. No recurring task carries one
    yet, which is exactly why this is cheap to pin now.
    """
    owner = auth_headers
    made: dict[str, list[str]] = {"tasks": []}
    try:
        start = date.today()
        task = _post(
            client,
            owner,
            "/tasks",
            title=f"{MARK} weekly",
            recurrence="weekly",
            not_before=start.isoformat(),
            due_date=(start + timedelta(days=3)).isoformat(),
            scheduled_date=start.isoformat(),
        )
        made["tasks"].append(task["id"])

        r = client.patch(
            f"/tasks/{task['id']}", headers=owner, json={"status": "completed"}
        )
        assert r.status_code == 200, r.text

        successors = [
            t
            for t in client.get("/tasks", headers=owner, params={"limit": 500}).json()
            if t["title"] == f"{MARK} weekly" and t["id"] != task["id"]
        ]
        assert len(successors) == 1, "expected exactly one next occurrence"
        nxt = successors[0]
        made["tasks"].append(nxt["id"])

        assert nxt["not_before"] == (start + timedelta(days=7)).isoformat(), (
            "the window's opening bound was dropped or not shifted with the close"
        )
        assert nxt["due_date"] == (start + timedelta(days=10)).isoformat()
    finally:
        _sweep(**made)
