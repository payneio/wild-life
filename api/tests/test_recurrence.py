"""The wire→cadence translation, proved rather than asserted.

The interesting test is not "does `FREQ=WEEKLY;BYDAY=TU` produce `["tue"]`" — that
just restates the code. It is: **do the two expressions name the same days?** So
every translation is expanded twice, once by `dateutil` from the wire rule and
once by our own evaluator from the translated cadence, and the two date sets must
be identical over a real span.

`TestEveryRuleInTheCorpus` runs that over all 74 recurring events in the live
database. It skips without one, because a translation that is right about
invented rules and wrong about the ones actually received is worth nothing.
"""

from __future__ import annotations

import os
from datetime import UTC, date, datetime, timedelta

import pytest

from wild_life.recurrence import Cadence, expand, translate
from wild_life.rules import is_due

TUE = datetime(2026, 7, 28, 14, 30, tzinfo=UTC)


def days_from_cadence(cadence: Cadence, start: date, end: date) -> set[date]:
    """Expand our cadence the way the evaluator would, via a stand-in rule."""

    class _Rule:
        days_of_week = cadence.days_of_week
        interval_days = cadence.interval_days

    stop = min(end, cadence.end_date) if cadence.end_date else end
    out: set[date] = set()
    day = start
    while day <= stop:
        if is_due(_Rule(), start, day):  # type: ignore[arg-type]
            out.add(day)
        day += timedelta(days=1)
    return out


def agree(rrule: str, dtstart: datetime, horizon_days: int = 730) -> None:
    """The wire rule and our translation of it name the same days."""
    cadence = translate(rrule, dtstart)
    assert cadence is not None, f"expected {rrule!r} to translate"
    until = dtstart + timedelta(days=horizon_days)
    wire = {o.date() for o in expand(rrule, dtstart, until=until)}
    ours = days_from_cadence(cadence, dtstart.date(), until.date())
    assert ours == wire, (
        f"{rrule!r}\n  only in ours: {sorted(ours - wire)[:5]}"
        f"\n  only on the wire: {sorted(wire - ours)[:5]}"
    )


class TestWhatTranslates:
    def test_weekly_on_one_named_day(self) -> None:
        agree("FREQ=WEEKLY;BYDAY=TU", TUE)

    def test_weekly_on_several(self) -> None:
        agree("FREQ=WEEKLY;BYDAY=TU,WE,TH", TUE)

    def test_weekly_with_no_byday_uses_the_start_weekday(self) -> None:
        """Information the rule string does not carry — it is in DTSTART."""
        assert translate("FREQ=WEEKLY", TUE) == Cadence(["tue"], 1, None)
        agree("FREQ=WEEKLY", TUE)

    def test_daily(self) -> None:
        agree("FREQ=DAILY", TUE)

    def test_daily_every_n(self) -> None:
        agree("FREQ=DAILY;INTERVAL=3", TUE)

    def test_every_other_week_on_one_day(self) -> None:
        """The stride and the weekday filter agree because the anchor is that
        weekday — which is why `anchor_for` uses the rule's own start."""
        agree("FREQ=WEEKLY;INTERVAL=2;BYDAY=WE", datetime(2026, 7, 29, 9, tzinfo=UTC))

    def test_until_is_an_instant_not_a_day(self) -> None:
        """The bug this test was written to catch, and did on its first run.

        The series meets at 14:30; the deadline is 06:59:59 on the 25th. That
        Tuesday is *not* included, because 14:30 is past it — so the last
        admissible day is the 18th. Truncating UNTIL to `.date()` added a
        meeting that never happened to eleven of the seventy-four real rules.
        """
        rule = "FREQ=WEEKLY;UNTIL=20260825T065959Z;BYDAY=TU"
        # Stated as what the two expressions *name*, not as a column value:
        # `end_date` is a bound, and several bounds exclude the same Tuesday.
        days = days_from_cadence(translate(rule, TUE), TUE.date(), date(2026, 12, 31))
        assert max(days) == date(2026, 8, 18)
        assert date(2026, 8, 25) not in days
        agree(rule, TUE)

    def test_until_past_the_meeting_time_keeps_that_day(self) -> None:
        rule = "FREQ=WEEKLY;UNTIL=20260825T235959Z;BYDAY=TU"
        days = days_from_cadence(translate(rule, TUE), TUE.date(), date(2026, 12, 31))
        assert max(days) == date(2026, 8, 25)
        agree(rule, TUE)

    def test_a_date_valued_until_means_the_whole_day(self) -> None:
        """And expands, which it did not: dateutil refuses a naive UNTIL against
        an aware DTSTART (RFC 5545 §3.3.10), and one real rule is written that
        way — so the expander raised on a rule its sender is happy with."""
        rule = "FREQ=DAILY;UNTIL=20260825"
        cadence = translate(rule, TUE)
        assert cadence is not None
        assert cadence.end_date == date(2026, 8, 25)
        agree(rule, TUE)

    def test_wkst_is_noise_for_what_we_accept(self) -> None:
        """It orders weeks for multi-day intervals, which we refuse anyway."""
        agree("FREQ=WEEKLY;BYDAY=WE;WKST=SU", datetime(2026, 7, 29, 9, tzinfo=UTC))


class TestWhatIsRefusedByName:
    """A translation that quietly approximates is worse than none: the calendar
    would then disagree with the sender about what was scheduled."""

    @pytest.mark.parametrize(
        "rrule",
        [
            "FREQ=YEARLY",
            "FREQ=YEARLY;WKST=TU",
            "FREQ=MONTHLY;BYDAY=1SA",
            "FREQ=MONTHLY;UNTIL=20251014T072959Z;BYDAY=2TU",
            "FREQ=DAILY;COUNT=2",
            "FREQ=WEEKLY;COUNT=5",
            "FREQ=WEEKLY;COUNT=3;INTERVAL=2;BYDAY=WE",
            "FREQ=WEEKLY;INTERVAL=2;BYDAY=TU,TH",
            "FREQ=DAILY;BYDAY=MO,TU",
            "FREQ=WEEKLY;BYMONTH=3;BYDAY=TU",
            "FREQ=WEEKLY;BYSETPOS=-1;BYDAY=TU",
            "",
        ],
    )
    def test_it_says_so_rather_than_guessing(self, rrule: str) -> None:
        assert translate(rrule, TUE) is None

    def test_count_is_refused_even_though_it_could_be_derived(self) -> None:
        """A count and a date mean different things the moment anything else
        changes: widen the weekdays and a COUNT rule ends sooner, an UNTIL rule
        does not. Deriving one from the other would silently pick."""
        assert translate("FREQ=WEEKLY;COUNT=5;BYDAY=TU", TUE) is None


class TestExdatesAreInstantsNotStrings:
    def test_a_differently_written_exdate_still_cancels(self) -> None:
        """The same moment is spelled several ways across exporters, and 13
        events carry them; comparing text would keep a cancelled occurrence."""
        occ = expand(
            "FREQ=WEEKLY;BYDAY=TU",
            TUE,
            until=TUE + timedelta(days=21),
            exdates=["2026-08-04T14:30:00Z"],  # Z, where ours renders +00:00
        )
        assert date(2026, 8, 4) not in {o.date() for o in occ}
        assert date(2026, 8, 11) in {o.date() for o in occ}


@pytest.mark.skipif(
    not os.environ.get("WILD_LIFE_DATABASE_URL"), reason="needs the live corpus"
)
class TestEveryRuleInTheCorpus:
    """The rules actually received, not the ones I imagined.

    A translator that is right about invented rules and wrong about real ones is
    worth nothing, and this corpus is where the refusals were chosen from.
    """

    @staticmethod
    def _corpus() -> list[tuple[str, datetime]]:
        from sqlalchemy import create_engine, text

        from wild_life.config import settings

        engine = create_engine(settings.sync_database_url, future=True)
        try:
            with engine.connect() as conn:
                return [
                    (r.recurrence, r.start_at)
                    for r in conn.execute(
                        text(
                            "SELECT recurrence, start_at FROM wild_life.events "
                            "WHERE recurrence IS NOT NULL"
                        )
                    )
                ]
        finally:
            engine.dispose()

    def test_every_translation_names_the_same_days_as_the_wire(self) -> None:
        corpus = self._corpus()
        assert corpus, "no recurring events found"
        translated = 0
        for rrule, dtstart in corpus:
            if translate(rrule, dtstart) is None:
                continue  # materialised instead — see the backfill
            translated += 1
            agree(rrule, dtstart)
        # If this drops to zero the translator has silently started refusing
        # everything, and every assertion above would still pass.
        assert translated > 0

    def test_the_refusals_are_the_ones_we_named(self) -> None:
        """Whatever we decline must decline for a stated reason, not by accident."""
        refused = [r for r, s in self._corpus() if translate(r, s) is None]
        for rrule in refused:
            assert any(
                marker in rrule for marker in ("FREQ=YEARLY", "FREQ=MONTHLY", "COUNT=")
            ), f"unexpected refusal: {rrule!r}"


@pytest.mark.skipif(
    not os.environ.get("WILD_LIFE_DATABASE_URL"), reason="needs the live corpus"
)
class TestTheRulesThatWereWritten:
    """The backfilled occasion rules, checked against the wire they came from.

    The corpus test above proves the *translation*. This proves what was actually
    stored: a rule whose columns were written correctly but whose start date or
    weekday was dropped on the way into the row would still pass everything else.
    """

    @staticmethod
    def _pairs() -> list[tuple[object, str, datetime]]:
        from sqlalchemy import create_engine, text

        from wild_life.config import settings

        engine = create_engine(settings.sync_database_url, future=True)
        try:
            with engine.connect() as conn:
                return [
                    (r, r.recurrence, r.start_at)
                    for r in conn.execute(
                        text("""
                        SELECT r.days_of_week, r.interval_days, r.start_date,
                               r.end_date, r.timing, r.expected_minutes, r.kind,
                               e.recurrence, e.start_at
                        FROM wild_life.routines r
                        JOIN wild_life.events e
                          ON r.source_ref = 'event:' || e.id || '\\:rule'
                        """)
                    )
                ]
        finally:
            engine.dispose()

    def test_each_stored_rule_names_the_same_days_as_its_wire_rule(self) -> None:
        pairs = self._pairs()
        assert pairs, "no occasion rules found — run wild-life-backfill-moments"
        for row, rrule, dtstart in pairs:
            horizon = dtstart + timedelta(days=730)
            wire = {o.date() for o in expand(rrule, dtstart, until=horizon)}
            stored = days_from_cadence(
                Cadence(list(row.days_of_week), row.interval_days, row.end_date),
                row.start_date,
                horizon.date(),
            )
            assert stored == wire, (
                f"{rrule!r}\n  only in the stored rule: {sorted(stored - wire)[:5]}"
                f"\n  only on the wire: {sorted(wire - stored)[:5]}"
            )

    def test_every_one_is_an_occasion_carrying_a_time_of_day(self) -> None:
        """A rule that generates occasions must say when in the day and for how
        long, or step 4 has nothing to draw."""
        for row, _, dtstart in self._pairs():
            assert row.kind == "occasion"
            assert row.timing == [dtstart.strftime("%H:%M")]

    def test_nothing_untranslatable_was_written_as_a_rule(self) -> None:
        """The refusals must have stayed refused all the way into the database."""
        for _, rrule, dtstart in self._pairs():
            assert translate(rrule, dtstart) is not None, rrule
