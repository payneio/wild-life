"""The moments endpoint: one timeline, queried from whichever end you hold.

Writes to the real castle Postgres like the rest of the suite, so everything is
`ZZ-` prefixed and removed in a `finally`.
"""

from collections.abc import Iterator
from datetime import UTC, datetime, timedelta

import pytest
from fastapi.testclient import TestClient

from wild_life.config import settings

MARK = "ZZ-moment"


@pytest.fixture
def cleanup(client: TestClient, auth_headers: dict[str, str]) -> Iterator[list[str]]:
    made: list[str] = []
    yield made
    for moment_id in made:
        client.delete(f"/moments/{moment_id}", headers=auth_headers)


def _make(
    client: TestClient,
    headers: dict[str, str],
    cleanup: list[str],
    **body: object,
) -> dict:
    body.setdefault("kind", "observation")
    body.setdefault("title", f"{MARK} {body.get('kind')}")
    resp = client.post("/moments", json=body, headers=headers)
    assert resp.status_code == 201, resp.text
    made = resp.json()
    cleanup.append(made["id"])
    return made


class TestCapture:
    def test_a_moment_carries_its_links(
        self, client: TestClient, auth_headers: dict, require_db: None, cleanup: list
    ) -> None:
        person = client.get("/people?limit=1", headers=auth_headers).json()[0]
        made = _make(
            client,
            auth_headers,
            cleanup,
            kind="occasion",
            started_at=datetime.now(UTC).isoformat(),
            links=[
                {
                    "role": "participant",
                    "entity_type": "person",
                    "entity_id": person["id"],
                }
            ],
        )
        assert made["links"] == [
            {"role": "participant", "entity_type": "person", "entity_id": person["id"]}
        ]

    def test_the_kind_must_be_in_the_vocabulary(
        self, client: TestClient, auth_headers: dict, require_db: None
    ) -> None:
        resp = client.post(
            "/moments", json={"kind": "appointment"}, headers=auth_headers
        )
        # `appointment` is deliberately not a kind: who is present and where it
        # happens are links, so it is an `occasion` like any other.
        assert resp.status_code == 422


class TestTheFrame:
    def test_a_link_to_the_self_person_is_dropped_not_stored(
        self, client: TestClient, auth_headers: dict, require_db: None, cleanup: list
    ) -> None:
        if settings.self_person_id is None:
            pytest.skip("no self person configured")
        made = _make(
            client,
            auth_headers,
            cleanup,
            kind="reflection",
            links=[
                {
                    "role": "mention",
                    "entity_type": "person",
                    "entity_id": str(settings.self_person_id),
                }
            ],
        )
        # The composer sends what the prose says, and journal prose mentions its
        # own author. Storing it would assert that the writer was present at his
        # own life — 340 such links existed before the backfill dropped them.
        assert made["links"] == []


class TestTheTimelineOfAThing:
    def test_it_is_one_query_with_different_arguments(
        self, client: TestClient, auth_headers: dict, require_db: None, cleanup: list
    ) -> None:
        program = client.get("/programs?limit=1", headers=auth_headers).json()[0]
        made = _make(
            client,
            auth_headers,
            cleanup,
            kind="observation",
            started_at=datetime.now(UTC).isoformat(),
            links=[
                {
                    "role": "subject",
                    "entity_type": "program",
                    "entity_id": program["id"],
                }
            ],
        )
        listed = client.get(
            f"/moments?linked_type=program&linked_id={program['id']}",
            headers=auth_headers,
        ).json()
        assert made["id"] in [m["id"] for m in listed]

    def test_role_narrows_involving_to_with(
        self, client: TestClient, auth_headers: dict, require_db: None, cleanup: list
    ) -> None:
        program = client.get("/programs?limit=1", headers=auth_headers).json()[0]
        made = _make(
            client,
            auth_headers,
            cleanup,
            kind="observation",
            links=[
                {
                    "role": "mention",
                    "entity_type": "program",
                    "entity_id": program["id"],
                }
            ],
        )
        involving = client.get(
            f"/moments?linked_type=program&linked_id={program['id']}",
            headers=auth_headers,
        ).json()
        subjects = client.get(
            f"/moments?linked_type=program&linked_id={program['id']}&role=subject",
            headers=auth_headers,
        ).json()
        # Mentioned is not the same as about: subject puts a moment on a
        # timeline, mention puts it in the backlinks.
        assert made["id"] in [m["id"] for m in involving]
        assert made["id"] not in [m["id"] for m in subjects]


class TestALapseIsDerived:
    def test_a_passed_window_with_no_occurrence_is_unfulfilled(
        self, client: TestClient, auth_headers: dict, require_db: None, cleanup: list
    ) -> None:
        past = datetime.now(UTC) - timedelta(days=2)
        made = _make(
            client,
            auth_headers,
            cleanup,
            kind="work",
            window_start=past.isoformat(),
            window_end=past.isoformat(),
        )
        listed = client.get("/moments?unfulfilled=true", headers=auth_headers).json()
        assert made["id"] in [m["id"] for m in listed]

    def test_withdrawing_it_takes_it_out(
        self, client: TestClient, auth_headers: dict, require_db: None, cleanup: list
    ) -> None:
        past = datetime.now(UTC) - timedelta(days=2)
        made = _make(
            client,
            auth_headers,
            cleanup,
            kind="work",
            window_start=past.isoformat(),
            window_end=past.isoformat(),
        )
        client.patch(
            f"/moments/{made['id']}",
            json={
                "withdrawn_at": datetime.now(UTC).isoformat(),
                "withdrawal_reason": f"{MARK} decided against it",
            },
            headers=auth_headers,
        )
        listed = client.get("/moments?unfulfilled=true", headers=auth_headers).json()
        # Abandoned by choice is an act and is recorded; abandoned by neglect is
        # a silence. Only the second is unfulfilled.
        assert made["id"] not in [m["id"] for m in listed]

    def test_an_occurrence_takes_it_out(
        self, client: TestClient, auth_headers: dict, require_db: None, cleanup: list
    ) -> None:
        past = datetime.now(UTC) - timedelta(days=2)
        made = _make(
            client,
            auth_headers,
            cleanup,
            kind="work",
            window_start=past.isoformat(),
            window_end=past.isoformat(),
        )
        client.patch(
            f"/moments/{made['id']}",
            json={"started_at": past.isoformat()},
            headers=auth_headers,
        )
        after = client.get(f"/moments/{made['id']}", headers=auth_headers).json()
        listed = client.get("/moments?unfulfilled=true", headers=auth_headers).json()
        # The intention survives the occurrence: the delta between what you
        # planned and what happened is the only way estimation improves.
        assert after["window_start"] is not None
        assert made["id"] not in [m["id"] for m in listed]


class TestEditing:
    def test_links_are_replaced_wholesale_when_sent(
        self, client: TestClient, auth_headers: dict, require_db: None, cleanup: list
    ) -> None:
        people = client.get("/people?limit=2", headers=auth_headers).json()
        made = _make(
            client,
            auth_headers,
            cleanup,
            kind="occasion",
            links=[
                {
                    "role": "participant",
                    "entity_type": "person",
                    "entity_id": people[0]["id"],
                }
            ],
        )
        updated = client.patch(
            f"/moments/{made['id']}",
            json={
                "links": [
                    {
                        "role": "participant",
                        "entity_type": "person",
                        "entity_id": people[1]["id"],
                    }
                ]
            },
            headers=auth_headers,
        ).json()
        assert [link["entity_id"] for link in updated["links"]] == [people[1]["id"]]

    def test_omitting_links_leaves_them_alone(
        self, client: TestClient, auth_headers: dict, require_db: None, cleanup: list
    ) -> None:
        person = client.get("/people?limit=1", headers=auth_headers).json()[0]
        made = _make(
            client,
            auth_headers,
            cleanup,
            kind="occasion",
            links=[
                {
                    "role": "participant",
                    "entity_type": "person",
                    "entity_id": person["id"],
                }
            ],
        )
        updated = client.patch(
            f"/moments/{made['id']}",
            json={"title": f"{MARK} renamed"},
            headers=auth_headers,
        ).json()
        # A single-field PATCH is how every editor in this app saves; it must not
        # silently strip what it did not mention.
        assert len(updated["links"]) == 1


class TestTheInboxPredicate:
    """The inbox is a state, not a lack.

    `capture` is the kind a surface writes when it genuinely could not know what
    you were writing — quick capture is the only one that may. Defining the
    surface by absence instead is what once counted a 29-year archive as a
    backlog: writing turned inward has no subject to be filed under, so every
    reflection looked unfiled.

    The predicate lives in two places — `InboxPage.tsx` and
    `unresolved_captures_count` in `routers/reviews.py` — and nothing but this
    binds them.
    """

    def test_is_exactly_the_unresolved_kind(
        self, client: TestClient, auth_headers: dict, require_db: None, cleanup: list
    ) -> None:
        captured = _make(client, auth_headers, cleanup, kind="capture")
        reflected = _make(client, auth_headers, cleanup, kind="reflection")

        r = client.get("/moments", params={"kind": "capture"}, headers=auth_headers)
        assert r.status_code == 200
        ids = {m["id"] for m in r.json()}
        assert captured["id"] in ids
        # The mistake this replaces: a reflection has no subject and is not an
        # inbox item for that reason.
        assert reflected["id"] not in ids

    def test_dashboard_count_agrees_with_the_list(
        self, client: TestClient, auth_headers: dict, require_db: None, cleanup: list
    ) -> None:
        """Two independent expressions of one definition; nothing else binds them."""
        _make(client, auth_headers, cleanup, kind="capture")
        listed = client.get(
            "/moments",
            params={"kind": "capture", "limit": "2000"},
            headers=auth_headers,
        )
        assert listed.status_code == 200
        dash = client.get("/review-dashboard", headers=auth_headers)
        assert dash.status_code == 200
        assert dash.json()["unresolved_captures_count"] == len(listed.json())

    def test_resolving_one_files_it_and_names_the_act(
        self, client: TestClient, auth_headers: dict, require_db: None, cleanup: list
    ) -> None:
        """Triage is one write: naming what it concerns settles both the subject
        and the kind, which is the only place in the app a person decides one."""
        area = client.get("/areas?limit=1", headers=auth_headers).json()[0]
        captured = _make(client, auth_headers, cleanup, kind="capture")

        r = client.patch(
            f"/moments/{captured['id']}",
            json={
                "kind": "observation",
                "links": [
                    {"role": "subject", "entity_type": "area", "entity_id": area["id"]}
                ],
            },
            headers=auth_headers,
        )
        assert r.status_code == 200, r.text
        assert r.json()["kind"] == "observation"

        still = client.get("/moments", params={"kind": "capture"}, headers=auth_headers)
        assert captured["id"] not in {m["id"] for m in still.json()}


class TestTheJournalIsAKind:
    def test_it_is_reflection_and_carries_no_subject(
        self, client: TestClient, auth_headers: dict, require_db: None, cleanup: list
    ) -> None:
        """Defined positively, and *not* as the self person's log.

        The self is the frame, not a subject. Rooting the journal at Paul meant
        253 links asserting he was present at his own life, which is exactly the
        noise that made "every moment with Melissa" unanswerable.
        """
        # With the occurrence the composer always writes: prose is day-precision,
        # and a moment with neither occurrence nor window sorts `nullslast`,
        # which past 200 rows is off the end of the page.
        reflected = _make(
            client,
            auth_headers,
            cleanup,
            kind="reflection",
            started_at=datetime.now(UTC).isoformat(),
            all_day=True,
        )
        assert reflected["links"] == []

        r = client.get("/moments", params={"kind": "reflection"}, headers=auth_headers)
        assert r.status_code == 200
        assert reflected["id"] in {m["id"] for m in r.json()}

    def test_the_rail_counts_what_the_stream_shows(
        self, client: TestClient, auth_headers: dict, require_db: None, cleanup: list
    ) -> None:
        """A rail scoped differently from its stream offers a month that scrolls
        nowhere."""
        when = datetime.now(UTC)
        _make(
            client,
            auth_headers,
            cleanup,
            kind="reflection",
            started_at=when.isoformat(),
            all_day=True,
        )
        r = client.get(
            "/moments/calendar", params={"kind": "reflection"}, headers=auth_headers
        )
        assert r.status_code == 200
        buckets = r.json()
        assert all({"year", "month", "count"} <= set(b) for b in buckets)
        assert any(b["year"] == when.year and b["month"] == when.month for b in buckets)


class TestBacklinksAreARole:
    def test_mention_excludes_what_the_log_already_shows(
        self, client: TestClient, auth_headers: dict, require_db: None, cleanup: list
    ) -> None:
        """`subject` puts a moment on a thing's timeline; `mention` puts it in
        that thing's backlinks.

        The panel used to re-derive this by dropping rows whose root matched,
        which on one area left 18 of 20 "mentioned in" entries duplicating the
        list right above them. With roles it is two queries, so the two surfaces
        cannot drift — `Backlinks.tsx` asks for this one.
        """
        area = client.get("/areas?limit=1", headers=auth_headers).json()[0]
        about = _make(
            client,
            auth_headers,
            cleanup,
            links=[{"role": "subject", "entity_type": "area", "entity_id": area["id"]}],
        )
        touching = _make(
            client,
            auth_headers,
            cleanup,
            links=[{"role": "mention", "entity_type": "area", "entity_id": area["id"]}],
        )

        params = {"linked_type": "area", "linked_id": area["id"]}
        involving = {
            m["id"]
            for m in client.get("/moments", params=params, headers=auth_headers).json()
        }
        assert {about["id"], touching["id"]} <= involving

        mentions = {
            m["id"]
            for m in client.get(
                "/moments", params={**params, "role": "mention"}, headers=auth_headers
            ).json()
        }
        assert touching["id"] in mentions
        assert about["id"] not in mentions
