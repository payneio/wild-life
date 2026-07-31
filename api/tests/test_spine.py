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
                    "SELECT id, kind, title, started_at, window_start, all_day,"
                    " expected_minutes FROM wild_life.moments WHERE source_ref = :r"
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

    def test_scheduling_writes_an_intention_with_a_window(
        self, client: TestClient, auth_headers: dict, require_db: None
    ) -> None:
        """Being scheduled for Tuesday is an intention, not an occurrence."""
        h = auth_headers
        task = _post(
            client, h, "/tasks", title=f"{MARK} plan me", scheduled_date="2026-08-04"
        )
        try:
            got = _moments(f"task:{task['id']}:work")
            assert len(got) == 1
            assert got[0]["kind"] == "work"
            assert got[0]["window_start"] is not None
            assert got[0]["started_at"] is None, "an intention has not happened yet"
        finally:
            client.delete(f"/tasks/{task['id']}", headers=h)

    def test_deleting_the_task_takes_both_moments(
        self, client: TestClient, auth_headers: dict, require_db: None
    ) -> None:
        h = auth_headers
        task = _post(
            client, h, "/tasks", title=f"{MARK} delete me", scheduled_date="2026-08-04"
        )
        _patch(client, h, f"/tasks/{task['id']}", status="completed")
        assert len(_moments(f"task:{task['id']}:work")) == 1
        client.delete(f"/tasks/{task['id']}", headers=h)
        assert _moments(f"task:{task['id']}:work") == []
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
