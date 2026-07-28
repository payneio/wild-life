"""Notes: every note has a subject, and the inbox is what's left.

The Journal and the Inbox used to be defined by negation — Journal was "notes
carrying neither tag", Inbox was "every unrooted note" — which made a deliberate
journal entry indistinguishable from an unfiled scrap. Both are positive now: the
journal is the self Person's log, and an unrooted note is one you wrote without
saying what it is about. The predicate lives in two places (this router's filters
and `/review-dashboard`), so the tests that matter pin the predicate, not the
plumbing.
"""

from collections.abc import Generator

import pytest
from fastapi.testclient import TestClient

from wild_life.config import settings

MARK = "ZZ-notes"


@pytest.fixture
def self_id(require_db: None) -> str:
    if settings.self_person_id is None:
        pytest.skip("no self person configured (WILD_LIFE_SELF_PERSON_ID)")
    return str(settings.self_person_id)


@pytest.fixture
def notes(
    client: TestClient, auth_headers: dict[str, str], self_id: str
) -> Generator[dict[str, str], None, None]:
    """One note about the self person, one about nothing at all."""
    made: dict[str, str] = {}
    r = client.post(
        "/notes",
        json={
            "title": f"{MARK} journal",
            "body": "x",
            "entry_date": "2026-07-27",
            "entity_type": "person",
            "entity_id": self_id,
        },
        headers=auth_headers,
    )
    assert r.status_code == 201, r.text
    made["journal"] = r.json()["id"]

    r = client.post(
        "/notes", json={"title": f"{MARK} unfiled", "body": "x"}, headers=auth_headers
    )
    assert r.status_code == 201, r.text
    made["unfiled"] = r.json()["id"]

    yield made
    for note_id in made.values():
        client.delete(f"/notes/{note_id}", headers=auth_headers)


class TestGenreIsGone:
    def test_note_type_is_not_accepted_or_returned(
        self, client: TestClient, auth_headers: dict[str, str], require_db: None
    ) -> None:
        """A genre column only ever restated the root, so it no longer exists.
        Pydantic ignores the unknown key rather than 422-ing; what matters is that
        nothing round-trips."""
        r = client.post(
            "/notes",
            json={"title": f"{MARK} genre", "body": "x", "note_type": "journal"},
            headers=auth_headers,
        )
        assert r.status_code == 201
        assert "note_type" not in r.json()
        client.delete(f"/notes/{r.json()['id']}", headers=auth_headers)


class TestTheJournalIsARoot:
    def test_scopes_by_subject(
        self,
        client: TestClient,
        auth_headers: dict[str, str],
        self_id: str,
        notes: dict[str, str],
    ) -> None:
        """ "My observations about myself" — the same relation a note on anyone
        else has to that person."""
        r = client.get(
            "/notes",
            params={"entity_type": "person", "entity_id": self_id},
            headers=auth_headers,
        )
        assert r.status_code == 200
        ids = {n["id"] for n in r.json()}
        assert notes["journal"] in ids
        assert notes["unfiled"] not in ids

    def test_calendar_scopes_by_the_same_root(
        self,
        client: TestClient,
        auth_headers: dict[str, str],
        self_id: str,
        notes: dict[str, str],
    ) -> None:
        """The rail has to count the rows the stream shows, or it offers a month
        that scrolls nowhere."""
        r = client.get(
            "/notes/calendar",
            params={"entity_type": "person", "entity_id": self_id},
            headers=auth_headers,
        )
        assert r.status_code == 200
        buckets = r.json()
        assert all({"year", "month", "count"} <= set(b) for b in buckets)
        assert any(b["year"] == 2026 and b["month"] == 7 for b in buckets)


class TestTheInboxPredicate:
    def test_is_exactly_unrooted(
        self, client: TestClient, auth_headers: dict[str, str], notes: dict[str, str]
    ) -> None:
        r = client.get(
            "/notes", params={"entity_type__isnull": "true"}, headers=auth_headers
        )
        assert r.status_code == 200
        ids = {n["id"] for n in r.json()}
        assert notes["unfiled"] in ids
        assert notes["journal"] not in ids

    def test_dashboard_count_agrees_with_the_list(
        self, client: TestClient, auth_headers: dict[str, str], notes: dict[str, str]
    ) -> None:
        """Two independent expressions of one definition; nothing else binds them."""
        listed = client.get(
            "/notes", params={"entity_type__isnull": "true"}, headers=auth_headers
        )
        dash = client.get("/review-dashboard", headers=auth_headers)
        assert dash.status_code == 200
        assert dash.json()["unrooted_notes_count"] == len(listed.json())


class TestWhiteboard:
    def test_is_one_buffer_that_survives_writes(
        self, client: TestClient, auth_headers: dict[str, str], require_db: None
    ) -> None:
        """Singular by construction — there is no id to address and nothing to
        list, which is what keeps it out of the entity model."""
        before = client.get("/whiteboard", headers=auth_headers)
        assert before.status_code == 200
        original = before.json()["content"]
        try:
            r = client.put(
                "/whiteboard", json={"content": f"{MARK} scratch"}, headers=auth_headers
            )
            assert r.status_code == 200
            assert r.json()["content"] == f"{MARK} scratch"
            assert client.get("/whiteboard", headers=auth_headers).json()[
                "content"
            ] == (f"{MARK} scratch")
        finally:
            client.put("/whiteboard", json={"content": original}, headers=auth_headers)
