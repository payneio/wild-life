"""Invariants the moment spine must hold, and the guard that protects the journal.

These run against the real castle Postgres like the rest of the suite, but they
only read: the backfill is idempotent and re-runnable, so what is worth asserting
is not "did it run" but "is what it produced still true".

Counts are deliberately not asserted. The backfill is one-way while both systems
coexist, so a note written this afternoon has no moment yet, and a test that
demanded equality would fail every time the app was used. The invariants below
hold whatever has drifted.
"""

from typing import get_args

import pytest
from sqlalchemy import create_engine, text

from wild_life.backfill_moments import _instant, run
from wild_life.config import settings
from wild_life.schemas.common import MomentKind, MomentRole


@pytest.fixture
def conn(require_db: None):  # noqa: ANN201 - fixture yields a Connection
    engine = create_engine(settings.sync_database_url, future=True)
    with engine.connect() as c:
        yield c
    engine.dispose()


def _scalar(conn, sql: str) -> int:  # noqa: ANN001
    return conn.execute(text(sql)).scalar_one()


class TestTheFrame:
    """You are the frame, so nothing points at you."""

    def test_nothing_links_to_the_self_person(self, conn) -> None:  # noqa: ANN001
        if settings.self_person_id is None:
            pytest.skip("no self person configured")
        leaked = _scalar(
            conn,
            "SELECT count(*) FROM wild_life.moment_links "
            f"WHERE entity_type = 'person' AND entity_id = '{settings.self_person_id}'",
        )
        # 325 participant edges said "Paul was there" and 15 journal entries
        # mentioned their own author. Both assert nothing, and both destroy the
        # informative link — who *else* was involved.
        assert leaked == 0

    def test_a_reflection_is_about_nothing_else(self, conn) -> None:  # noqa: ANN001
        misfiled = _scalar(
            conn,
            """
            SELECT count(*) FROM wild_life.moments m
            JOIN wild_life.moment_links l
              ON l.moment_id = m.id AND l.role = 'subject'
            WHERE m.kind = 'reflection'
            """,
        )
        # The journal is defined positively by kind. A reflection that also
        # carried a subject would be an observation wearing the wrong name.
        assert misfiled == 0


class TestPayloadBelongsToThePairing:
    def test_every_reading_hangs_off_a_metric_subject(self, conn) -> None:  # noqa: ANN001
        stray = _scalar(
            conn,
            """
            SELECT count(*) FROM wild_life.moment_readings r
            JOIN wild_life.moment_links l ON l.id = r.link_id
            JOIN wild_life.moments m ON m.id = l.moment_id
            WHERE l.role <> 'subject'
               OR l.entity_type <> 'metric'
               OR m.kind <> 'measurement'
            """,
        )
        assert stray == 0

    def test_every_dose_hangs_off_a_medication_subject(self, conn) -> None:  # noqa: ANN001
        stray = _scalar(
            conn,
            """
            SELECT count(*) FROM wild_life.moment_doses d
            JOIN wild_life.moment_links l ON l.id = d.link_id
            JOIN wild_life.moments m ON m.id = l.moment_id
            WHERE l.role <> 'subject'
               OR l.entity_type <> 'medication'
               OR m.kind <> 'dose'
            """,
        )
        assert stray == 0


class TestPrivacyIsStructural:
    def test_only_an_occasion_can_leave_the_system(self, conn) -> None:  # noqa: ANN001
        exportable = _scalar(
            conn,
            """
            SELECT count(*) FROM wild_life.calendar_records c
            JOIN wild_life.moments m ON m.id = c.moment_id
            WHERE m.kind <> 'occasion'
            """,
        )
        # A moment with no calendar record has nothing that can be exported, so
        # the privacy question is "which moments were given one" rather than
        # "did the export query say WHERE correctly". A reflection acquiring one
        # would be 29 years of journal becoming eligible for a shared calendar.
        assert exportable == 0


class TestTheVocabularyIsClosed:
    def test_every_kind_is_in_the_literal(self, conn) -> None:  # noqa: ANN001
        rows = conn.execute(
            text("SELECT DISTINCT kind FROM wild_life.moments")
        ).scalars()
        assert set(rows) <= set(get_args(MomentKind))

    def test_every_role_is_in_the_literal(self, conn) -> None:  # noqa: ANN001
        rows = conn.execute(
            text("SELECT DISTINCT role FROM wild_life.moment_links")
        ).scalars()
        assert set(rows) <= set(get_args(MomentRole))


class TestTheMappingRule:
    def test_reflections_came_from_self_rooted_notes(self, conn) -> None:  # noqa: ANN001
        if settings.self_person_id is None:
            pytest.skip("no self person configured")
        wrong = _scalar(
            conn,
            f"""
            SELECT count(*) FROM wild_life.moments m
            JOIN wild_life.notes n
              ON m.source_ref = 'note:' || n.id
            WHERE m.kind = 'reflection'
              AND NOT (n.entity_type = 'person'
                       AND n.entity_id = '{settings.self_person_id}')
            """,
        )
        assert wrong == 0

    def test_a_capture_is_a_note_that_said_nothing_about_itself(self, conn) -> None:  # noqa: ANN001
        wrong = _scalar(
            conn,
            """
            SELECT count(*) FROM wild_life.moments m
            JOIN wild_life.notes n ON m.source_ref = 'note:' || n.id
            WHERE m.kind = 'capture' AND n.entity_type IS NOT NULL
            """,
        )
        # `capture` is the inbox, and the inbox is a state rather than a lack:
        # a moment whose kind is unresolved because the surface could not know.
        assert wrong == 0


class TestTheGuard:
    def test_it_refuses_to_run_without_the_self_person(self, monkeypatch) -> None:  # noqa: ANN001
        monkeypatch.setattr(settings, "self_person_id", None)
        with pytest.raises(SystemExit) as raised:
            run(dry_run=True)
        # Silent misfiling is the failure mode worth a hard stop: without the
        # self person every journal entry migrates as an observation *about
        # Paul*, which looks entirely plausible in the data.
        assert "SELF_PERSON_ID" in str(raised.value)


class TestDayPrecision:
    def test_a_date_anchors_at_noon(self) -> None:
        from datetime import date

        got = _instant(date(2026, 7, 28))
        assert got is not None
        # Not midnight: a date rendered in a western timezone would slide to the
        # day before, which is how an importer turns "the 28th" into "the 27th".
        assert (got.hour, got.minute) == (12, 0)

    def test_an_instant_passes_through(self) -> None:
        from datetime import UTC, datetime

        moment = datetime(2026, 7, 28, 9, 15, tzinfo=UTC)
        assert _instant(moment) == moment
