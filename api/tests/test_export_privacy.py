"""Nothing without a calendar record may leave this system.

The invariant the plan singled out as structural and wanting a test. Privacy
here is not a filter someone has to remember to write — a moment with no
projection has nothing to export, so the question is never "did the export query
say WHERE correctly" but "which moments were given a record at all".

That property is worth pinning precisely because it is currently *implicit*: the
send path reads `events`, and every event is exportable in principle. When the
iMIP path moves onto (moment, calendar_record) this suite is what stops the
default flipping from "nothing leaves unless it was shared" to "everything leaves
unless something stopped it".
"""

from __future__ import annotations

from collections.abc import Iterator
from datetime import UTC, datetime, timedelta

import pytest
from fastapi.testclient import TestClient
from sqlalchemy import create_engine, text

from wild_life.config import settings

MARK = "ZZ-privacy"


@pytest.fixture
def cleanup(client: TestClient, auth_headers: dict[str, str]) -> Iterator[list[str]]:
    made: list[str] = []
    yield made
    for mid in made:
        client.delete(f"/moments/{mid}", headers=auth_headers)


def _records(moment_ids: list[str]) -> set[str]:
    """Which of these moments carry a calendar record."""
    if not moment_ids:
        return set()
    engine = create_engine(settings.sync_database_url, future=True)
    try:
        with engine.connect() as conn:
            rows = conn.execute(
                text(
                    "SELECT moment_id FROM wild_life.calendar_records "
                    "WHERE moment_id = ANY(:ids)"
                ),
                {"ids": [str(i) for i in moment_ids]},
            )
            return {str(r.moment_id) for r in rows}
    finally:
        engine.dispose()


class TestAMomentIsPrivateByDefault:
    def test_writing_something_down_gives_it_nothing_to_share(
        self, client: TestClient, auth_headers: dict, require_db: None, cleanup: list
    ) -> None:
        """The structural claim, at its narrowest: creating a moment through the
        ordinary path produces no projection, so there is nothing to leak."""
        for kind in ("reflection", "observation", "capture", "occasion"):
            r = client.post(
                "/moments",
                json={
                    "kind": kind,
                    "title": f"{MARK} {kind}",
                    "body": "private",
                    "started_at": datetime.now(UTC).isoformat(),
                },
                headers=auth_headers,
            )
            assert r.status_code == 201, r.text
            cleanup.append(r.json()["id"])
        assert _records(cleanup) == set(), (
            "a moment created through the ordinary path must have no calendar "
            "record — privacy is structural, not a filter"
        )

    def test_an_occasion_dragged_onto_the_calendar_is_no_different(
        self, client: TestClient, auth_headers: dict, require_db: None, cleanup: list
    ) -> None:
        """The surface most likely to be assumed public. It is not: sharing is a
        separate act, and one nobody has performed here."""
        start = datetime.now(UTC) + timedelta(days=3)
        r = client.post(
            "/moments",
            json={
                "kind": "occasion",
                "title": f"{MARK} dragged",
                "started_at": start.isoformat(),
                "ended_at": (start + timedelta(hours=1)).isoformat(),
            },
            headers=auth_headers,
        )
        assert r.status_code == 201
        cleanup.append(r.json()["id"])
        assert _records(cleanup) == set()


class TestTheExportableSetIsNamed:
    def test_only_moments_with_a_record_are_reachable_for_sending(
        self, client: TestClient, auth_headers: dict, require_db: None
    ) -> None:
        """Whatever the send path is, its candidate set must be bounded by the
        projection table rather than by the moment table.

        Stated as a count so it survives the iMIP port: the number of moments
        that could be exported is the number of calendar records, and that is
        strictly fewer than the number of moments.
        """
        engine = create_engine(settings.sync_database_url, future=True)
        try:
            with engine.connect() as conn:
                moments = conn.execute(
                    text("SELECT count(*) FROM wild_life.moments")
                ).scalar_one()
                records = conn.execute(
                    text("SELECT count(*) FROM wild_life.calendar_records")
                ).scalar_one()
                orphans = conn.execute(
                    text(
                        "SELECT count(*) FROM wild_life.calendar_records c "
                        "LEFT JOIN wild_life.moments m ON m.id = c.moment_id "
                        "WHERE m.id IS NULL"
                    )
                ).scalar_one()
        finally:
            engine.dispose()
        assert records < moments, "every moment is exportable — the default inverted"
        assert orphans == 0, "a projection with no moment behind it"

    def test_invites_are_off_unless_turned_on(
        self, client: TestClient, auth_headers: dict, require_db: None
    ) -> None:
        """Even among moments that *do* have a projection, sending is opt-in.
        Two gates, not one: having a record makes a thing shareable, and
        `invites_enabled` makes it sent."""
        engine = create_engine(settings.sync_database_url, future=True)
        try:
            with engine.connect() as conn:
                enabled = conn.execute(
                    text(
                        "SELECT count(*) FROM wild_life.calendar_records "
                        "WHERE invites_enabled"
                    )
                ).scalar_one()
                total = conn.execute(
                    text("SELECT count(*) FROM wild_life.calendar_records")
                ).scalar_one()
        finally:
            engine.dispose()
        assert enabled < total, "every projection would send mail"
