"""The way back out of the cut-over.

After the surfaces move, writing lands only in the spine. These prove that a
revert would not lose it — and, just as importantly, that the script says out
loud what it cannot bring back.
"""

from collections.abc import Iterator
from datetime import UTC, datetime

import pytest
from fastapi.testclient import TestClient
from sqlalchemy import create_engine, text

from wild_life.config import settings
from wild_life.reverse_moments import run

MARK = "ZZ-reverse"


@pytest.fixture
def cleanup(client: TestClient, auth_headers: dict[str, str]) -> Iterator[list[str]]:
    made: list[str] = []
    yield made
    engine = create_engine(settings.sync_database_url, future=True)
    with engine.begin() as conn:
        for row_id in made:
            conn.execute(
                text("DELETE FROM wild_life.notes WHERE id = :i"), {"i": row_id}
            )
            conn.execute(
                text("DELETE FROM wild_life.events WHERE id = :i"), {"i": row_id}
            )
            conn.execute(
                text("DELETE FROM wild_life.entity_links WHERE source_id = :i"),
                {"i": row_id},
            )
    engine.dispose()
    for row_id in made:
        client.delete(f"/moments/{row_id}", headers=auth_headers)


def _row(sql: str, **params: object):  # noqa: ANN202
    engine = create_engine(settings.sync_database_url, future=True)
    with engine.connect() as conn:
        got = conn.execute(text(sql), params).one_or_none()
    engine.dispose()
    return got


class TestARevertLosesNothing:
    def test_a_reflection_comes_back_as_a_journal_note(
        self, client: TestClient, auth_headers: dict, require_db: None, cleanup: list
    ) -> None:
        if settings.self_person_id is None:
            pytest.skip("no self person configured")
        person = client.get("/people?limit=1", headers=auth_headers).json()[0]
        made = client.post(
            "/moments",
            json={
                "kind": "reflection",
                "title": f"{MARK} a reflection",
                "body": "written after the cut-over",
                "started_at": datetime.now(UTC).isoformat(),
                "links": [
                    {
                        "role": "mention",
                        "entity_type": "person",
                        "entity_id": person["id"],
                    }
                ],
            },
            headers=auth_headers,
        ).json()
        cleanup.append(made["id"])

        run(dry_run=False)

        note = _row(
            "SELECT id, title, body, entity_type, entity_id, entry_date "
            "FROM wild_life.notes WHERE id = :i",
            i=made["id"],
        )
        assert note is not None
        assert note.title == f"{MARK} a reflection"
        # The journal was "notes rooted at the self person" before the inversion,
        # so going back means re-rooting there — the id is shared, so the two
        # rows are recognisably one thing.
        assert (note.entity_type, note.entity_id) == ("person", settings.self_person_id)
        mention = _row(
            "SELECT target_id FROM wild_life.note_mentions WHERE note_id = :i",
            i=made["id"],
        )
        assert mention is not None

    def test_an_occasion_comes_back_as_an_event(
        self, client: TestClient, auth_headers: dict, require_db: None, cleanup: list
    ) -> None:
        program = client.get("/programs?limit=1", headers=auth_headers).json()[0]
        when = datetime.now(UTC)
        made = client.post(
            "/moments",
            json={
                "kind": "occasion",
                "title": f"{MARK} an occasion",
                "started_at": when.isoformat(),
                "all_day": True,
                "links": [
                    {
                        "role": "subject",
                        "entity_type": "program",
                        "entity_id": program["id"],
                    }
                ],
            },
            headers=auth_headers,
        ).json()
        cleanup.append(made["id"])

        run(dry_run=False)

        event = _row(
            "SELECT id, title, entity_type, entity_id, all_day "
            "FROM wild_life.events WHERE id = :i",
            i=made["id"],
        )
        assert event is not None
        assert event.entity_type == "program"
        assert event.all_day is True

    def test_it_stamps_provenance_so_a_later_backfill_agrees(
        self, client: TestClient, auth_headers: dict, require_db: None, cleanup: list
    ) -> None:
        made = client.post(
            "/moments",
            json={"kind": "capture", "title": f"{MARK} unfiled", "body": "thought"},
            headers=auth_headers,
        ).json()
        cleanup.append(made["id"])

        run(dry_run=False)

        after = client.get(f"/moments/{made['id']}", headers=auth_headers).json()
        # Without the stamp, re-running the backfill would create a *second*
        # moment from the note this just wrote.
        assert after["source_ref"] == f"note:{made['id']}"


class TestItSaysWhatItCannotBringBack:
    def test_a_work_intention_is_reported_not_dropped_silently(
        self, client: TestClient, auth_headers: dict, require_db: None, cleanup: list
    ) -> None:
        made = client.post(
            "/moments",
            json={
                "kind": "work",
                "title": f"{MARK} an intention",
                "window_start": datetime.now(UTC).isoformat(),
                "window_end": datetime.now(UTC).isoformat(),
            },
            headers=auth_headers,
        ).json()
        cleanup.append(made["id"])

        tally = run(dry_run=True)

        # The old schema has no way to hold "I mean to spend two hours on this on
        # Tuesday". Knowing that a revert would hide it is the difference between
        # an informed decision and a surprise.
        assert tally.get("no old-world form: work", 0) >= 1

    def test_a_check_writes_nothing(
        self, client: TestClient, auth_headers: dict, require_db: None, cleanup: list
    ) -> None:
        made = client.post(
            "/moments",
            json={"kind": "capture", "title": f"{MARK} dry run", "body": "x"},
            headers=auth_headers,
        ).json()
        cleanup.append(made["id"])

        run(dry_run=True)

        assert (
            _row("SELECT id FROM wild_life.notes WHERE id = :i", i=made["id"]) is None
        )
