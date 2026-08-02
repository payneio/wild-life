"""Acts write the spine as they happen, not five minutes later.

Before this, every surface except moments/occurrences/calendar-mail wrote its own
table and became a moment only when the mirror tick ran — so the timeline and
every record's Log lagged reality for most of what you do in the app. You logged
a dose, opened the medication, and it was not there.

These assert the inline write, and the two properties that make it safe to run
alongside the mirror that is still there:

* **idempotent on `source_ref`** — the tick upserts onto what the act already
  wrote rather than duplicating it, which is what lets surfaces move over one at
  a time instead of on a flag day;
* **it retracts** — undoing the act removes the moment, because a timeline that
  keeps asserting a finish you reopened is worse than one that lags.

Needs the Wild PC Postgres.
"""

from fastapi.testclient import TestClient
from sqlalchemy import create_engine, text

from wild_life.config import settings

MARK = "ZZ-spine"


def _post(client: TestClient, h: dict, path: str, **body: object) -> dict:
    r = client.post(path, headers=h, json=body)
    assert r.status_code in (200, 201), (path, r.status_code, r.text)
    return r.json()


def _patch(client: TestClient, h: dict, path: str, **body: object) -> dict:
    r = client.patch(path, headers=h, json=body)
    assert r.status_code == 200, (path, r.status_code, r.text)
    return r.json()


def _moments(source_ref: str) -> list[dict]:
    """Every moment carrying this ref, read straight from the database.

    Not through `/moments`: the point is often that there is exactly *one* row,
    and a list endpoint that happened to filter would hide a duplicate.
    """
    eng = create_engine(settings.sync_database_url)
    try:
        with eng.connect() as conn:
            rows = conn.execute(
                text(
                    "SELECT id, kind, title, started_at, all_day"
                    " FROM wild_life.moments WHERE source_ref = :r"
                ),
                {"r": source_ref},
            ).mappings()
            return [dict(r) for r in rows]
    finally:
        eng.dispose()


def _links(source_ref: str) -> list[tuple[str, str]]:
    eng = create_engine(settings.sync_database_url)
    try:
        with eng.connect() as conn:
            return [
                (r.role, r.entity_type)
                for r in conn.execute(
                    text(
                        "SELECT l.role, l.entity_type FROM wild_life.moment_links l"
                        " JOIN wild_life.moments m ON m.id = l.moment_id"
                        " WHERE m.source_ref = :r ORDER BY l.entity_type"
                    ),
                    {"r": source_ref},
                )
            ]
    finally:
        eng.dispose()


class TestATaskWritesAsItFinishes:
    def test_completing_writes_a_completion_immediately(
        self, client: TestClient, auth_headers: dict, require_db: None
    ) -> None:
        h = auth_headers
        task = _post(client, h, "/tasks", title=f"{MARK} finish me")
        try:
            assert _moments(f"task:{task['id']}:completion") == []
            _patch(client, h, f"/tasks/{task['id']}", status="completed")
            got = _moments(f"task:{task['id']}:completion")
            assert len(got) == 1
            assert got[0]["kind"] == "completion"
            assert _links(f"task:{task['id']}:completion") == [("subject", "task")]
        finally:
            client.delete(f"/tasks/{task['id']}", headers=h)

    def test_reopening_retracts_it(
        self, client: TestClient, auth_headers: dict, require_db: None
    ) -> None:
        """A finish that was undone must stop being on the timeline."""
        h = auth_headers
        task = _post(client, h, "/tasks", title=f"{MARK} undo me")
        try:
            _patch(client, h, f"/tasks/{task['id']}", status="completed")
            assert len(_moments(f"task:{task['id']}:completion")) == 1
            _patch(client, h, f"/tasks/{task['id']}", status="in_progress")
            assert _moments(f"task:{task['id']}:completion") == []
        finally:
            client.delete(f"/tasks/{task['id']}", headers=h)

    def test_scheduling_writes_no_moment(
        self, client: TestClient, auth_headers: dict, require_db: None
    ) -> None:
        """Being scheduled for Tuesday is an intention, and stays on the task.

        It had a moment once — kind `work`, placed by a window — which said in a
        second table what `tasks.scheduled_date` already said, and put on the
        timeline of what happened something that had not.
        """
        h = auth_headers
        task = _post(
            client,
            h,
            "/tasks",
            title=f"{MARK} plan me",
            scheduled_date="2026-08-04",
            not_before="2026-08-01",
        )
        try:
            assert _moments(f"task:{task['id']}:work") == []
            got = client.get(f"/tasks/{task['id']}", headers=h).json()
            assert got["not_before"] == "2026-08-01"
            assert got["scheduled_date"] == "2026-08-04"
        finally:
            client.delete(f"/tasks/{task['id']}", headers=h)

    def test_deleting_the_task_takes_its_moment(
        self, client: TestClient, auth_headers: dict, require_db: None
    ) -> None:
        h = auth_headers
        task = _post(
            client, h, "/tasks", title=f"{MARK} delete me", scheduled_date="2026-08-04"
        )
        _patch(client, h, f"/tasks/{task['id']}", status="completed")
        assert len(_moments(f"task:{task['id']}:completion")) == 1
        client.delete(f"/tasks/{task['id']}", headers=h)
        assert _moments(f"task:{task['id']}:completion") == []


class TestADoseIsOnTheLogWhenYouLogIt:
    def test_an_intake_writes_its_dose(
        self, client: TestClient, auth_headers: dict, require_db: None
    ) -> None:
        h = auth_headers
        med = _post(client, h, "/medications", name=f"{MARK} med")
        try:
            intake = _post(
                client,
                h,
                "/intakes",
                medication_id=med["id"],
                amount=500,
                unit="mg",
            )
            ref = f"routine_instance:{intake['id']}"
            got = _moments(ref)
            assert len(got) == 1
            assert got[0]["kind"] == "dose"
            assert _links(ref) == [("subject", "medication")]
        finally:
            client.delete(f"/medications/{med['id']}", headers=h)

    def test_an_intake_with_no_medication_is_an_activity(
        self, client: TestClient, auth_headers: dict, require_db: None
    ) -> None:
        """The kind follows the act: a step with no medication is not a dose."""
        h = auth_headers
        proto = _post(client, h, "/protocols", name=f"{MARK} proto")
        try:
            routine = _post(
                client, h, "/routines", protocol_id=proto["id"], timing=["morning"]
            )
            r = client.post(f"/routines/{routine['id']}/complete", headers=h)
            assert r.status_code in (200, 201), r.text
            ref = f"routine_instance:{r.json()['id']}"
            got = _moments(ref)
            assert len(got) == 1
            assert got[0]["kind"] == "activity"
            assert _links(ref) == [("subject", "routine")]
        finally:
            client.delete(f"/protocols/{proto['id']}", headers=h)


class TestAPanelIsOneAct:
    def test_a_group_reading_is_one_moment_with_a_value_per_metric(
        self, client: TestClient, auth_headers: dict, require_db: None
    ) -> None:
        """Five results are one occasion, so the value keys on the link."""
        h = auth_headers
        made = []
        try:
            area = _post(client, h, "/areas", name=f"{MARK} area")
            group = _post(
                client,
                h,
                "/metric-groups",
                name=f"{MARK} panel",
                entity_type="area",
                entity_id=area["id"],
            )
            m1 = _post(
                client,
                h,
                "/metrics",
                name=f"{MARK} m1",
                entity_type="area",
                entity_id=area["id"],
            )
            m2 = _post(
                client,
                h,
                "/metrics",
                name=f"{MARK} m2",
                entity_type="area",
                entity_id=area["id"],
            )
            made = [m1["id"], m2["id"]]
            reading = _post(
                client,
                h,
                f"/metric-groups/{group['id']}/readings",
                recorded_at="2026-08-01T12:00:00Z",
                values=[
                    {"metric_id": m1["id"], "value": 1.0},
                    {"metric_id": m2["id"], "value": 2.0},
                ],
            )
            ref = f"group_reading:{reading['id']}"
            got = _moments(ref)
            assert len(got) == 1, "one act, not one per value"
            assert got[0]["kind"] == "measurement"
            assert _links(ref) == [("subject", "metric"), ("subject", "metric")]
        finally:
            for mid in made:
                client.delete(f"/metrics/{mid}", headers=h)


class TestWritingTwiceWritesOnce:
    def test_repeating_the_act_corrects_rather_than_duplicates(
        self, client: TestClient, auth_headers: dict, require_db: None
    ) -> None:
        """`source_ref` is the name, and a name holds one row.

        This began as "the mirror and the act agree" — the property that let both
        writers run at once during the cut-over. The mirror is gone, and the
        property is still the one holding the spine together: an act repeated,
        edited, or replayed corrects the moment it already wrote instead of
        laying down a second one. `uq_moments_source_ref` is what enforces it.
        """
        h = auth_headers
        task = _post(client, h, "/tasks", title=f"{MARK} twice")
        ref = f"task:{task['id']}:completion"
        try:
            _patch(client, h, f"/tasks/{task['id']}", status="completed")
            assert len(_moments(ref)) == 1
            # Same act again, then an edit that rewrites the moment's title.
            _patch(client, h, f"/tasks/{task['id']}", status="completed")
            _patch(client, h, f"/tasks/{task['id']}", title=f"{MARK} twice, renamed")
            got = _moments(ref)
            assert len(got) == 1, "a repeated act laid down a second moment"
            assert got[0]["title"] == f"{MARK} twice, renamed"
        finally:
            client.delete(f"/tasks/{task['id']}", headers=h)


class TestNoMomentOutlivesItsSource:
    def test_deleting_a_place_takes_its_visits_moments(
        self, client: TestClient, auth_headers: dict, require_db: None
    ) -> None:
        """Visits cascade in the database, so nothing in Python sees them go.

        Found by the mirror's own accumulation test failing on live data after
        the inline write landed: a location deleted through the API left visit
        moments asserting time spent somewhere that no longer existed.
        """
        h = auth_headers
        loc = _post(
            client,
            h,
            "/locations",
            name=f"{MARK} place",
            latitude=47.6,
            longitude=-122.3,
            radius_m=100,
        )
        client.delete(f"/locations/{loc['id']}", headers=h)

        eng = create_engine(settings.sync_database_url)
        try:
            with eng.connect() as conn:
                orphans = conn.execute(
                    text("""
                        SELECT count(*) FROM wild_life.moments m
                        WHERE m.source_ref LIKE 'location_visit:%'
                          AND NOT EXISTS (
                              SELECT 1 FROM wild_life.location_visits v
                              WHERE 'location_visit:' || v.id::text = m.source_ref
                          )
                    """)
                ).scalar()
        finally:
            eng.dispose()
        assert orphans == 0


class TestAnIntentionMeetsAMoment:
    """A4. The relation that used to be a naming convention.

    Asking whether a commitment happened once meant `replace(source_ref,
    ':work', ':completion')` — a string transformation standing in for a join,
    which could not be indexed, constrained, or trusted through a rename.
    """

    def _edges(self, task_id: str, role: str = "discharges") -> int:
        eng = create_engine(settings.sync_database_url)
        try:
            with eng.connect() as conn:
                return conn.execute(
                    text(
                        "SELECT count(*) FROM wild_life.intention_moments"
                        " WHERE intention_type='task' AND intention_id=:t"
                        "   AND role=:r"
                    ),
                    {"t": task_id, "r": role},
                ).scalar_one()
        finally:
            eng.dispose()

    def test_completing_a_task_discharges_it(
        self, client: TestClient, auth_headers: dict, require_db: None
    ) -> None:
        h = auth_headers
        task = _post(client, h, "/tasks", title=f"{MARK} discharge me")
        try:
            assert self._edges(task["id"]) == 0
            _patch(client, h, f"/tasks/{task['id']}", status="completed")
            assert self._edges(task["id"]) == 1
        finally:
            client.delete(f"/tasks/{task['id']}", headers=h)

    def test_reopening_retracts_the_discharge(
        self, client: TestClient, auth_headers: dict, require_db: None
    ) -> None:
        """An intention that is open again was not met by anything."""
        h = auth_headers
        task = _post(client, h, "/tasks", title=f"{MARK} retract me")
        try:
            _patch(client, h, f"/tasks/{task['id']}", status="completed")
            assert self._edges(task["id"]) == 1
            _patch(client, h, f"/tasks/{task['id']}", status="in_progress")
            assert self._edges(task["id"]) == 0
        finally:
            client.delete(f"/tasks/{task['id']}", headers=h)

    def test_completing_twice_writes_one_edge(
        self, client: TestClient, auth_headers: dict, require_db: None
    ) -> None:
        h = auth_headers
        task = _post(client, h, "/tasks", title=f"{MARK} twice discharged")
        try:
            _patch(client, h, f"/tasks/{task['id']}", status="completed")
            _patch(client, h, f"/tasks/{task['id']}", title=f"{MARK} renamed")
            assert self._edges(task["id"]) == 1
        finally:
            client.delete(f"/tasks/{task['id']}", headers=h)


class TestAnEndingHasACause:
    """A5. `completed` and `cancelled` said *that* it ended, never why."""

    def _cause(self, client: TestClient, h: dict, task_id: str) -> str | None:
        return client.get(f"/tasks/{task_id}", headers=h).json()["ending_cause"]

    def test_completing_discharges(
        self, client: TestClient, auth_headers: dict, require_db: None
    ) -> None:
        h = auth_headers
        t = _post(client, h, "/tasks", title=f"{MARK} cause discharged")
        try:
            assert self._cause(client, h, t["id"]) is None
            _patch(client, h, f"/tasks/{t['id']}", status="completed")
            assert self._cause(client, h, t["id"]) == "discharged"
        finally:
            client.delete(f"/tasks/{t['id']}", headers=h)

    def test_cancelling_defaults_to_abandoned_and_can_be_corrected(
        self, client: TestClient, auth_headers: dict, require_db: None
    ) -> None:
        """Abandoned and voided look identical in a status, and A6 attaches
        valence to the difference — so cancelling records the commoner one as a
        default the caller may correct, rather than guessing or leaving it
        uncaused."""
        h = auth_headers
        t = _post(client, h, "/tasks", title=f"{MARK} cause abandoned")
        try:
            _patch(client, h, f"/tasks/{t['id']}", status="cancelled")
            assert self._cause(client, h, t["id"]) == "abandoned"
            _patch(client, h, f"/tasks/{t['id']}", ending_cause="voided")
            assert self._cause(client, h, t["id"]) == "voided"
        finally:
            client.delete(f"/tasks/{t['id']}", headers=h)

    def test_reopening_clears_the_cause(
        self, client: TestClient, auth_headers: dict, require_db: None
    ) -> None:
        """An intention that is open again ended for no reason, because it has
        not ended."""
        h = auth_headers
        t = _post(client, h, "/tasks", title=f"{MARK} cause cleared")
        try:
            _patch(client, h, f"/tasks/{t['id']}", status="completed")
            _patch(client, h, f"/tasks/{t['id']}", status="in_progress")
            assert self._cause(client, h, t["id"]) is None
        finally:
            client.delete(f"/tasks/{t['id']}", headers=h)


class TestAssignmentIsItsOwnLifecycle:
    """A7. A decline ends the assignment, not the commitment."""

    def test_declining_returns_responsibility_and_keeps_the_task(
        self, client: TestClient, auth_headers: dict, require_db: None
    ) -> None:
        h = auth_headers
        person = _post(client, h, "/people", name=f"{MARK} delegate")
        t = _post(client, h, "/tasks", title=f"{MARK} delegated work")
        try:
            r = client.post(
                f"/tasks/{t['id']}/assignment",
                headers=h,
                json={"event": "offered", "person_id": person["id"]},
            )
            assert r.status_code == 200, r.text
            assert r.json()["responsible_id"] == person["id"]

            r = client.post(
                f"/tasks/{t['id']}/assignment", headers=h, json={"event": "declined"}
            )
            assert r.status_code == 200, r.text
            body = r.json()
            assert body["responsible_id"] is None, "responsibility returns"
            assert body["status"] != "cancelled", "the commitment survives"
            assert body["ending_cause"] is None, "a decline is not an ending"
        finally:
            client.delete(f"/tasks/{t['id']}", headers=h)
            client.delete(f"/people/{person['id']}", headers=h)
