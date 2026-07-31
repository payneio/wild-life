"""Invariants the moment spine must hold, whatever wrote it.

These run against the real Wild PC Postgres like the rest of the suite, but they
only read. They outlived the mirror that used to produce the corpus: what is
worth asserting was never "did the tick run" but "is what is in there still
true", and that question survives the writer changing.

Counts are deliberately not asserted — the corpus grows every time the app is
used, and a test demanding equality would fail on a life being lived. Each
invariant below holds whatever has drifted.
"""

from typing import get_args

import pytest
from sqlalchemy import create_engine, text

from wild_life.config import settings
from wild_life.spine import instant
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


class TestNothingAccumulates:
    """A one-way mirror has to be able to forget, or it only ever grows."""

    def test_no_derived_visit_outlives_its_source(self, conn) -> None:  # noqa: ANN001
        orphans = _scalar(
            conn,
            """
            SELECT count(*) FROM wild_life.moments m
            WHERE m.kind = 'visit' AND m.source = 'derived'
              AND m.source_ref LIKE 'location_visit:%'
              AND m.body = '' AND m.title IS NULL
              AND NOT EXISTS (
                  SELECT 1 FROM wild_life.location_visits v
                  WHERE 'location_visit:' || v.id::text = m.source_ref
              )
            """,
        )
        # Replay deletes and re-derives its window every tick. While a visit's id
        # was minted by the database on insert, every pass produced a visit the
        # mirror had never seen and a moment nobody could reach the source of:
        # 50 rows for 5 visits at one address in three days, growing by three
        # every quarter hour. Two things hold this at zero — a derived visit is
        # named by (place, entered_at) so re-deriving reproduces its id, and the
        # backfill reaps the untouched moments whose source row is gone.
        assert orphans == 0

    def test_one_moment_per_visit(self, conn) -> None:  # noqa: ANN001
        duplicated = _scalar(
            conn,
            """
            SELECT count(*) FROM (
                SELECT 1 FROM wild_life.moments m
                JOIN wild_life.moment_links l
                  ON l.moment_id = m.id AND l.role = 'place'
                WHERE m.kind = 'visit' AND m.source = 'derived'
                GROUP BY l.entity_id, m.started_at
                HAVING count(*) > 1
            ) AS repeated
            """,
        )
        # The symptom the invariant above explains, asserted where a reader would
        # notice it: the same place entered at the same instant is one visit.
        assert duplicated == 0


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


class TestDayPrecision:
    def test_a_date_anchors_at_the_start_of_the_day(self) -> None:
        from datetime import date

        got = instant(date(2026, 7, 28))
        assert got is not None
        # Not midnight: a date rendered in a western timezone would slide to the
        # day before, which is how an importer turns "the 28th" into "the 27th".
        assert (got.hour, got.minute) == (12, 0)

    def test_an_instant_passes_through(self) -> None:
        from datetime import UTC, datetime

        moment = datetime(2026, 7, 28, 9, 15, tzinfo=UTC)
        assert instant(moment) == moment
