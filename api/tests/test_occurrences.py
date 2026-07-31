"""The calendar read path: three sources, one shape, nothing counted twice.

The failure this suite mostly guards against is duplication. A translated series
has *both* a rule of ours and the wire rule it came from, kept verbatim for
replay — and expanding both put the same therapy appointment on the calendar
twice a week until the anchor was taught to defer to its rule.
"""

from __future__ import annotations

from collections.abc import Iterator
from datetime import UTC, datetime, timedelta

import pytest
from fastapi.testclient import TestClient

MARK = "ZZ-occ"
# A Monday, well clear of anything real in the corpus.
MON = datetime(2027, 3, 1, 17, 0, tzinfo=UTC)
WINDOW = {
    "since": (MON - timedelta(days=1)).isoformat(),
    "until": (MON + timedelta(days=28)).isoformat(),
}


@pytest.fixture
def cleanup(client: TestClient, auth_headers: dict[str, str]) -> Iterator[dict]:
    made: dict[str, list[str]] = {"moments": [], "rules": []}
    yield made
    for mid in made["moments"]:
        client.delete(f"/moments/{mid}", headers=auth_headers)
    for rid in made["rules"]:
        client.delete(f"/routines/{rid}", headers=auth_headers)


def make_rule(client: TestClient, headers: dict, cleanup: dict, **over) -> dict:
    body = {
        "name": f"{MARK} weekly",
        "kind": "occasion",
        "timing": ["17:00"],
        "days_of_week": ["mon"],
        "interval_days": 1,
        "start_date": MON.date().isoformat(),
        "end_date": (MON + timedelta(days=27)).date().isoformat(),
        "expected_minutes": 30,
        **over,
    }
    r = client.post("/routines", json=body, headers=headers)
    assert r.status_code == 201, r.text
    cleanup["rules"].append(r.json()["id"])
    return r.json()


def make_moment(client: TestClient, headers: dict, cleanup: dict, **body) -> dict:
    body.setdefault("kind", "occasion")
    body.setdefault("title", f"{MARK} one-off")
    r = client.post("/moments", json=body, headers=headers)
    assert r.status_code == 201, r.text
    cleanup["moments"].append(r.json()["id"])
    return r.json()


def occurrences(client: TestClient, headers: dict, **extra) -> list[dict]:
    r = client.get("/occurrences", params={**WINDOW, **extra}, headers=headers)
    assert r.status_code == 200, r.text
    return [o for o in r.json() if MARK in (o.get("title") or "")]


class TestAPlainMoment:
    def test_appears_once_at_its_own_time(
        self, client: TestClient, auth_headers: dict, require_db: None, cleanup: dict
    ) -> None:
        made = make_moment(
            client, auth_headers, cleanup, started_at=MON.isoformat(), all_day=False
        )
        found = occurrences(client, auth_headers)
        assert len(found) == 1
        assert found[0]["moment_id"] == made["id"]
        assert found[0]["rule_id"] is None


class TestARuleProjects:
    def test_its_occurrences_are_computed_not_stored(
        self, client: TestClient, auth_headers: dict, require_db: None, cleanup: dict
    ) -> None:
        """Four Mondays, and not one of them a row: decision 10, made visible."""
        rule = make_rule(client, auth_headers, cleanup)
        found = occurrences(client, auth_headers)
        assert len(found) == 4
        assert all(o["moment_id"] is None for o in found)
        assert all(o["rule_id"] == rule["id"] for o in found)

        listed = client.get(
            "/moments",
            params={"kind": "occasion", "limit": "500"},
            headers=auth_headers,
        ).json()
        assert not [m for m in listed if MARK in (m.get("title") or "")]

    def test_it_carries_the_duration_the_rule_declares(
        self, client: TestClient, auth_headers: dict, require_db: None, cleanup: dict
    ) -> None:
        make_rule(client, auth_headers, cleanup)
        one = occurrences(client, auth_headers)[0]
        span = datetime.fromisoformat(one["end_at"]) - datetime.fromisoformat(
            one["start_at"]
        )
        assert span == timedelta(minutes=30)


class TestATouchedOccurrence:
    """What replaces iCal's override VEVENT."""

    def test_a_moved_one_replaces_its_slot_rather_than_doubling_it(
        self, client: TestClient, auth_headers: dict, require_db: None, cleanup: dict
    ) -> None:
        rule = make_rule(client, auth_headers, cleanup)
        slot = occurrences(client, auth_headers)[1]["occurrence_at"]
        moved = datetime.fromisoformat(slot) + timedelta(hours=3)
        make_moment(
            client,
            auth_headers,
            cleanup,
            title=f"{MARK} moved",
            rule_id=rule["id"],
            occurrence_at=slot,
            started_at=moved.isoformat(),
        )
        found = occurrences(client, auth_headers)
        assert len(found) == 4, "the series is still four long"
        at_slot = [o for o in found if o["occurrence_at"] == slot]
        assert len(at_slot) == 1
        assert at_slot[0]["moment_id"] is not None
        assert at_slot[0]["start_at"].startswith(moved.isoformat()[:16])

    def test_a_withdrawn_one_leaves_a_gap(
        self, client: TestClient, auth_headers: dict, require_db: None, cleanup: dict
    ) -> None:
        """The EXDATE, without an EXDATE. Withdrawal is stored because abandoning
        by choice is an act (decision 14); the absence is what the reader sees."""
        rule = make_rule(client, auth_headers, cleanup)
        slot = occurrences(client, auth_headers)[2]["occurrence_at"]
        made = make_moment(
            client,
            auth_headers,
            cleanup,
            title=f"{MARK} cancelled",
            rule_id=rule["id"],
            occurrence_at=slot,
            started_at=slot,
        )
        client.patch(
            f"/moments/{made['id']}",
            json={"withdrawn_at": datetime.now(UTC).isoformat()},
            headers=auth_headers,
        )
        found = occurrences(client, auth_headers)
        assert len(found) == 3
        assert slot not in [o["occurrence_at"] for o in found]


class TestNothingIsCountedTwice:
    def test_a_paused_rule_projects_nothing(
        self, client: TestClient, auth_headers: dict, require_db: None, cleanup: dict
    ) -> None:
        rule = make_rule(client, auth_headers, cleanup)
        assert len(occurrences(client, auth_headers)) == 4
        client.patch(
            f"/routines/{rule['id']}", json={"status": "paused"}, headers=auth_headers
        )
        assert occurrences(client, auth_headers) == []

    def test_the_live_corpus_has_no_duplicate_slots(
        self, client: TestClient, auth_headers: dict, require_db: None
    ) -> None:
        """Every translated series carries a wire rule *and* one of ours. Only one
        of them may expand, and this is where that is enforced against real data.

        January 2025 legitimately holds one repeated pair — the source calendar
        has a single event and a recurring master at the same minute — so the
        assertion is that a *rule-backed* slot never appears twice.
        """
        r = client.get(
            "/occurrences",
            params={"since": "2024-01-01T00:00:00Z", "until": "2026-01-01T00:00:00Z"},
            headers=auth_headers,
        )
        assert r.status_code == 200
        seen: set[tuple[str, str]] = set()
        for occ in r.json():
            if not occ["rule_id"]:
                continue
            key = (occ["rule_id"], occ["occurrence_at"])
            assert key not in seen, f"slot expanded twice: {key}"
            seen.add(key)
        assert seen, "no rule-backed occurrences in two years of real data"


class TestTheWindowIsBounded:
    def test_an_unbounded_ask_is_clamped_rather_than_expanding_forever(
        self, client: TestClient, auth_headers: dict, require_db: None
    ) -> None:
        """A YEARLY rule with no end has no last occurrence to stop at."""
        r = client.get(
            "/occurrences",
            params={"since": "2020-01-01T00:00:00Z", "until": "2400-01-01T00:00:00Z"},
            headers=auth_headers,
        )
        assert r.status_code == 200
        stamps = [o["start_at"] for o in r.json()]
        assert not stamps or max(stamps) < "2023"


class TestScopedEditing:
    """`this` / `following` / `all`, without the override bookkeeping.

    `routers/calendar.py` needed ~200 lines: exclude the date from the master,
    create a paired override row, seed its content from the master, re-parent
    later overrides across a split. None of that is here, because an occurrence
    that changed is simply a moment — a record rather than an absence plus a
    restatement.
    """

    def edit(self, client: TestClient, headers: dict, **body) -> dict:
        r = client.patch("/occurrences", json=body, headers=headers)
        assert r.status_code == 200, r.text
        return r.json()

    def test_this_touches_one_and_leaves_the_rest(
        self, client: TestClient, auth_headers: dict, require_db: None, cleanup: dict
    ) -> None:
        rule = make_rule(client, auth_headers, cleanup)
        slot = occurrences(client, auth_headers)[1]["occurrence_at"]
        moved = (datetime.fromisoformat(slot) + timedelta(hours=2)).isoformat()
        self.edit(
            client,
            auth_headers,
            scope="this",
            rule_id=rule["id"],
            occurrence_at=slot,
            changes={"start_at": moved, "title": f"{MARK} weekly (moved)"},
        )
        found = occurrences(client, auth_headers)
        cleanup["moments"] += [o["moment_id"] for o in found if o["moment_id"]]
        assert len(found) == 4
        touched = [o for o in found if o["occurrence_at"] == slot][0]
        assert touched["start_at"][:16] == moved[:16]
        assert [o for o in found if o["occurrence_at"] != slot][0]["title"].endswith(
            "weekly"
        )

    def test_all_edits_the_rule_itself(
        self, client: TestClient, auth_headers: dict, require_db: None, cleanup: dict
    ) -> None:
        rule = make_rule(client, auth_headers, cleanup)
        self.edit(
            client,
            auth_headers,
            scope="all",
            rule_id=rule["id"],
            changes={"title": f"{MARK} renamed"},
        )
        found = occurrences(client, auth_headers)
        assert len(found) == 4
        assert {o["title"] for o in found} == {f"{MARK} renamed"}

    def test_following_splits_the_series_in_two(
        self, client: TestClient, auth_headers: dict, require_db: None, cleanup: dict
    ) -> None:
        rule = make_rule(client, auth_headers, cleanup)
        before = occurrences(client, auth_headers)
        assert len(before) == 4
        split = before[2]["occurrence_at"]
        tail = self.edit(
            client,
            auth_headers,
            scope="following",
            rule_id=rule["id"],
            occurrence_at=split,
            changes={"title": f"{MARK} weekly after"},
        )
        cleanup["rules"].append(tail["rule_id"])
        found = occurrences(client, auth_headers)
        # Same number of occurrences, now spoken for by two rules.
        assert len(found) == 4
        assert len({o["rule_id"] for o in found}) == 2
        head = [o for o in found if o["occurrence_at"] < split]
        after = [o for o in found if o["occurrence_at"] >= split]
        assert len(head) == 2 and len(after) == 2
        assert {o["title"] for o in after} == {f"{MARK} weekly after"}


class TestScopedDeletion:
    def remove(self, client: TestClient, headers: dict, **params) -> None:
        r = client.request("DELETE", "/occurrences", params=params, headers=headers)
        assert r.status_code == 204, r.text

    def test_this_withdraws_rather_than_deletes(
        self, client: TestClient, auth_headers: dict, require_db: None, cleanup: dict
    ) -> None:
        """Abandoning by choice is an act. The EXDATE without an EXDATE."""
        rule = make_rule(client, auth_headers, cleanup)
        slot = occurrences(client, auth_headers)[1]["occurrence_at"]
        self.remove(
            client, auth_headers, scope="this", rule_id=rule["id"], occurrence_at=slot
        )
        found = occurrences(client, auth_headers)
        assert len(found) == 3
        assert slot not in [o["occurrence_at"] for o in found]

    def test_following_stops_the_series_there(
        self, client: TestClient, auth_headers: dict, require_db: None, cleanup: dict
    ) -> None:
        rule = make_rule(client, auth_headers, cleanup)
        slot = occurrences(client, auth_headers)[2]["occurrence_at"]
        self.remove(
            client,
            auth_headers,
            scope="following",
            rule_id=rule["id"],
            occurrence_at=slot,
        )
        found = occurrences(client, auth_headers)
        assert len(found) == 2
        assert all(o["occurrence_at"] < slot for o in found)

    def test_all_takes_the_series_and_its_exceptions(
        self, client: TestClient, auth_headers: dict, require_db: None, cleanup: dict
    ) -> None:
        rule = make_rule(client, auth_headers, cleanup)
        slot = occurrences(client, auth_headers)[1]["occurrence_at"]
        client.patch(
            "/occurrences",
            json={
                "scope": "this",
                "rule_id": rule["id"],
                "occurrence_at": slot,
                "changes": {"title": f"{MARK} exception"},
            },
            headers=auth_headers,
        )
        self.remove(client, auth_headers, scope="all", rule_id=rule["id"])
        assert occurrences(client, auth_headers) == []
        # The exception went with it: it existed only as an amendment to a series
        # that no longer does.
        left = client.get(
            "/moments",
            params={"kind": "occasion", "limit": "500"},
            headers=auth_headers,
        ).json()
        assert not [m for m in left if MARK in (m.get("title") or "")]
