"""Where a task sits among its siblings, and what moving it does.

Needs the castle Postgres. Everything created here is prefixed with MARK and
deleted in a `finally`, since these run against the real database.
"""

from fastapi.testclient import TestClient

from wild_life.ranking import GAP, MIN_GAP

MARK = "ZZ-rank-test"


def _post(client: TestClient, headers: dict, path: str, **body: object) -> dict:
    r = client.post(path, headers=headers, json=body)
    assert r.status_code in (200, 201), (path, r.status_code, r.text)
    return r.json()


def _move(client: TestClient, headers: dict, task_id: str, **body: object) -> dict:
    r = client.post(f"/tasks/{task_id}/move", headers=headers, json=body)
    assert r.status_code == 200, r.text
    return r.json()


def _titles(client: TestClient, headers: dict, project_id: str) -> list[str]:
    r = client.get(
        f"/tasks?project_id={project_id}&sort=position&include_closed=true",
        headers=headers,
    )
    assert r.status_code == 200, r.text
    return [t["title"] for t in r.json()]


class _Fixture:
    """A project holding three ranked tasks, A/B/C."""

    def __init__(self, client: TestClient, headers: dict) -> None:
        self.client, self.headers = client, headers
        self.program = _post(client, headers, "/programs", name=f"{MARK} program")
        self.project = _post(
            client,
            headers,
            "/projects",
            name=f"{MARK} project",
            program_id=self.program["id"],
        )
        self.tasks = {
            n: _post(
                client,
                headers,
                "/tasks",
                title=f"{MARK} {n}",
                project_id=self.project["id"],
                status="planned",
            )
            for n in ("A", "B", "C")
        }

    def order(self) -> list[str]:
        return [
            t.removeprefix(f"{MARK} ")
            for t in _titles(self.client, self.headers, self.project["id"])
        ]

    def cleanup(self) -> None:
        for t in self.tasks.values():
            self.client.delete(f"/tasks/{t['id']}", headers=self.headers)
        # Whatever else the test made under this project.
        r = self.client.get(
            f"/tasks?project_id={self.project['id']}&include_closed=true",
            headers=self.headers,
        )
        for t in r.json():
            self.client.delete(f"/tasks/{t['id']}", headers=self.headers)
        self.client.delete(f"/projects/{self.project['id']}", headers=self.headers)
        self.client.delete(f"/programs/{self.program['id']}", headers=self.headers)


def test_capture_ranks_last(
    client: TestClient, auth_headers: dict, require_db: None
) -> None:
    """A burst of captures keeps its typed order and doesn't disturb the list."""
    f = _Fixture(client, auth_headers)
    try:
        assert f.order() == ["A", "B", "C"]
        assert f.tasks["A"]["position"] < f.tasks["B"]["position"]
        assert f.tasks["B"]["position"] < f.tasks["C"]["position"]
    finally:
        f.cleanup()


def test_move_between_two_siblings(
    client: TestClient, auth_headers: dict, require_db: None
) -> None:
    f = _Fixture(client, auth_headers)
    try:
        # C between A and B.
        moved = _move(
            client,
            auth_headers,
            f.tasks["C"]["id"],
            after_id=f.tasks["A"]["id"],
            before_id=f.tasks["B"]["id"],
        )
        assert f.tasks["A"]["position"] < moved["position"] < f.tasks["B"]["position"]
        assert f.order() == ["A", "C", "B"]
    finally:
        f.cleanup()


def test_move_to_top_and_bottom(
    client: TestClient, auth_headers: dict, require_db: None
) -> None:
    """No anchor above means first; no anchor below means last."""
    f = _Fixture(client, auth_headers)
    try:
        _move(client, auth_headers, f.tasks["C"]["id"], before_id=f.tasks["A"]["id"])
        assert f.order() == ["C", "A", "B"]
        _move(client, auth_headers, f.tasks["C"]["id"], after_id=f.tasks["B"]["id"])
        assert f.order() == ["A", "B", "C"]
    finally:
        f.cleanup()


def test_move_carries_status_in_one_write(
    client: TestClient, auth_headers: dict, require_db: None
) -> None:
    """Dragging across a section boundary is one gesture, so it's one write."""
    f = _Fixture(client, auth_headers)
    try:
        moved = _move(
            client,
            auth_headers,
            f.tasks["C"]["id"],
            before_id=f.tasks["A"]["id"],
            status="in_progress",
        )
        assert moved["status"] == "in_progress"
        assert f.order() == ["C", "A", "B"]
    finally:
        f.cleanup()


def test_repeated_midpoints_respace_rather_than_collide(
    client: TestClient, auth_headers: dict, require_db: None
) -> None:
    """Halving the gap forever would run out of float; the server respaces.

    Without the rebalance two siblings eventually land on the same position and
    the list order becomes arbitrary again — the exact bug ranking was added to
    fix, reintroduced by the fix.
    """
    f = _Fixture(client, auth_headers)

    def rows() -> list[dict]:
        r = client.get(
            f"/tasks?project_id={f.project['id']}&sort=position&include_closed=true",
            headers=auth_headers,
        )
        assert r.status_code == 200, r.text
        return r.json()

    try:
        # Each pass drops the third task into the gap between the first two, so
        # that gap halves every time — 1024 / 2**40 is well under MIN_GAP.
        for _ in range(50):
            current = rows()
            _move(
                client,
                auth_headers,
                current[2]["id"],
                after_id=current[0]["id"],
                before_id=current[1]["id"],
            )

        positions = [t["position"] for t in rows()]
        assert positions == sorted(positions), positions
        assert len(set(positions)) == len(positions), positions
        # This is the assertion that proves respacing ran: 50 unmitigated
        # halvings of a 1024 gap lands near 1e-12, far under MIN_GAP.
        gaps = [b - a for a, b in zip(positions, positions[1:])]
        assert all(g > MIN_GAP for g in gaps), positions
    finally:
        f.cleanup()


def test_rank_is_scoped_to_the_parent(
    client: TestClient, auth_headers: dict, require_db: None
) -> None:
    """Two projects rank independently — positions only mean anything inside one."""
    f = _Fixture(client, auth_headers)
    other = _post(
        client,
        auth_headers,
        "/projects",
        name=f"{MARK} other project",
        program_id=f.program["id"],
    )
    try:
        first = _post(
            client,
            auth_headers,
            "/tasks",
            title=f"{MARK} elsewhere",
            project_id=other["id"],
            status="planned",
        )
        # Starts its own sequence rather than continuing the other project's.
        assert first["position"] == GAP
        assert f.order() == ["A", "B", "C"]
    finally:
        r = client.get(
            f"/tasks?project_id={other['id']}&include_closed=true", headers=auth_headers
        )
        for t in r.json():
            client.delete(f"/tasks/{t['id']}", headers=auth_headers)
        client.delete(f"/projects/{other['id']}", headers=auth_headers)
        f.cleanup()
