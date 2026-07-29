"""The rule evaluator: one answer to "what is expected on day D".

Pure functions over unsaved rows — no database, because the thing under test is
the cadence arithmetic and nothing else. The parity that matters against real
data (``compute_regimen`` unchanged across the generalisation) is checked by
running it, and is recorded in the migration.
"""

from datetime import UTC, date, datetime

from wild_life.models.protocols import Protocol
from wild_life.models.routines import Routine
from wild_life.rules import anchor_for, expected_days, expected_on, is_live, project

MON = date(2026, 7, 27)
TUE = date(2026, 7, 28)
WED = date(2026, 7, 29)


def rule(**kw) -> Routine:  # noqa: ANN003
    defaults = dict(
        kind="activity",
        status="active",
        timing=[],
        days_of_week=[],
        interval_days=1,
        months=[],
        day_of_month=None,
        week_of_month=None,
        start_date=None,
        end_date=None,
        timezone=None,
        expected_minutes=None,
        created_at=datetime(2026, 1, 1, tzinfo=UTC),
    )
    return Routine(**{**defaults, **kw})


def protocol(**kw) -> Protocol:  # noqa: ANN003
    defaults = dict(name="P", paused=False, start_date=None, end_date=None)
    return Protocol(**{**defaults, **kw})


class TestARuleNeedsNoProtocol:
    """The generalisation, stated as a test.

    Every routine used to be a step of a protocol, so a weekly habit had to pose
    as a clinical one — and because liveness was read off the protocol alone, a
    rule without one was *defensively treated as dead*. Both are gone.
    """

    def test_it_is_live_on_its_own_terms(self) -> None:
        assert is_live(rule(), None, TUE)

    def test_its_own_window_still_bounds_it(self) -> None:
        assert not is_live(rule(start_date=WED), None, TUE)
        assert not is_live(rule(end_date=MON), None, TUE)

    def test_a_dormant_status_stops_it(self) -> None:
        for status in ("paused", "archived", "completed", "cancelled"):
            assert not is_live(rule(status=status), None, TUE), status


class TestAProtocolNarrowsAndNeverWidens:
    def test_a_paused_protocol_stops_a_live_rule(self) -> None:
        assert not is_live(rule(), protocol(paused=True), TUE)

    def test_the_protocols_window_bounds_it_too(self) -> None:
        assert not is_live(rule(), protocol(start_date=WED), TUE)

    def test_a_dormant_rule_is_not_revived_by_a_live_protocol(self) -> None:
        """Direction matters: the container can only ever subtract."""
        assert not is_live(rule(status="paused"), protocol(), TUE)


class TestTheAnchor:
    def test_the_container_wins_when_it_has_one(self) -> None:
        """A protocol starting Tuesday puts its every-other-day step on Tuesdays."""
        assert anchor_for(rule(start_date=MON), protocol(start_date=TUE)) == TUE

    def test_then_the_rules_own_start(self) -> None:
        assert anchor_for(rule(start_date=MON), protocol()) == MON

    def test_then_the_day_it_was_written_down(self) -> None:
        assert anchor_for(rule(), None) == date(2026, 1, 1)


class TestSlotsAreFirstClass:
    def test_a_twice_daily_rule_expects_two_occurrences(self) -> None:
        assert expected_on(rule(timing=["morning", "evening"]), None, TUE) == [
            "morning",
            "evening",
        ]

    def test_a_slotless_habit_still_expects_one(self) -> None:
        """Something you either did or didn't is not a rule that expects nothing."""
        assert expected_on(rule(), None, TUE) == [""]

    def test_expecting_nothing_is_an_empty_list(self) -> None:
        assert expected_on(rule(status="paused"), None, TUE) == []


class TestCadence:
    def test_weekdays_filter(self) -> None:
        assert expected_on(rule(days_of_week=["tue"]), None, TUE) == [""]
        assert expected_on(rule(days_of_week=["tue"]), None, WED) == []

    def test_every_n_days_counts_from_the_anchor(self) -> None:
        r = rule(interval_days=2, start_date=MON)
        assert expected_on(r, None, MON) == [""]
        assert expected_on(r, None, TUE) == []
        assert expected_on(r, None, WED) == [""]


class TestAdherenceCountsTheScheduleNotItsLiveness:
    def test_pausing_does_not_retroactively_improve_the_past(self) -> None:
        """`expected_days` is cadence only, deliberately.

        Adherence divides what you did by what was expected *of the schedule*. If
        it asked about liveness, pausing a protocol today would rewrite every
        past week's denominator and make a missed month look perfect.
        """
        live = rule(days_of_week=["mon", "wed"])
        dormant = rule(days_of_week=["mon", "wed"], status="paused")
        window = (date(2026, 7, 1), date(2026, 7, 31))
        assert expected_days(live, None, *window) == expected_days(
            dormant, None, *window
        )
        assert expected_days(live, None, *window) == 9


class TestKindIsDerivedNotAsked:
    """The same law the moment vocabulary runs on, applied to the rule that
    generates them: the surface knows what act it is creating, and defaulting
    would have quietly made every dose rule generate activities."""

    def test_a_medication_makes_it_a_dose_rule(self) -> None:
        from uuid import uuid4

        from wild_life.schemas.routines import RoutineCreate

        assert RoutineCreate(medication_id=uuid4()).kind == "dose"

    def test_without_one_it_is_an_activity(self) -> None:
        from wild_life.schemas.routines import RoutineCreate

        assert RoutineCreate(activity="walk after dinner").kind == "activity"

    def test_an_explicit_kind_always_wins(self) -> None:
        """How an occasion or work rule — which has nothing to infer from — is written."""
        from wild_life.schemas.routines import RoutineCreate

        assert RoutineCreate(activity="standup", kind="occasion").kind == "occasion"


class TestAWeeklyMeetingIsNotAWeeklyInstant:
    """Why the zone is a column.

    A 9am meeting is 9am on both sides of a daylight-saving boundary. Stored as a
    UTC instant it is not: it silently becomes 8am or 10am for half the year, for
    every occurrence after the changeover. That is what the calendar does today,
    because TZID was resolved to an offset at import and thrown away.
    """

    def occurrences(self, tz: str | None) -> list[datetime]:
        # US DST ended 2026-11-01, so this window straddles it.
        r = rule(
            kind="occasion",
            days_of_week=["sun"],
            timing=["09:00"],
            expected_minutes=60,
            timezone=tz,
            start_date=date(2026, 10, 25),
        )
        return [
            o.start for o in project(r, None, date(2026, 10, 25), date(2026, 11, 9))
        ]

    def test_the_wall_time_holds_across_the_boundary(self) -> None:
        starts = self.occurrences("America/Los_Angeles")
        assert len(starts) == 3
        # Same wall clock every week...
        assert {s.strftime("%H:%M") for s in starts} == {"09:00"}
        # ...which means the UTC instant *must* shift, and does. The changeover
        # is at 02:00 on Nov 1, so 09:00 that morning is already PST: only the
        # 25th is UTC-7.
        assert [s.date().isoformat() for s in starts] == [
            "2026-10-25",
            "2026-11-01",
            "2026-11-08",
        ]
        assert [s.astimezone(UTC).hour for s in starts] == [16, 17, 17]

    def test_without_a_zone_it_is_the_instant_that_holds(self) -> None:
        """The historical behaviour, kept for series whose TZID was never stored:
        constant in UTC, and therefore an hour adrift locally after the change."""
        starts = self.occurrences(None)
        assert [s.astimezone(UTC).hour for s in starts] == [9, 9, 9]

    def test_an_unknown_zone_falls_back_rather_than_failing(self) -> None:
        """A zone this host does not know is a data problem, not a reason to
        render no calendar at all."""
        assert self.occurrences("Mars/Olympus") == self.occurrences(None)

    def test_a_named_slot_projects_no_instant(self) -> None:
        """ "breakfast" is a slot a dose is checked off in, not a clock time; only
        a rule that says when in the day can be drawn on a calendar."""
        r = rule(kind="dose", timing=["breakfast"], timezone="America/Los_Angeles")
        assert project(r, None, date(2026, 7, 27), date(2026, 7, 29)) == []

    def test_the_duration_comes_from_the_rule(self) -> None:
        r = rule(
            kind="occasion",
            timing=["09:00"],
            expected_minutes=90,
            timezone="America/Los_Angeles",
            start_date=date(2026, 7, 27),
        )
        occ = project(r, None, date(2026, 7, 27), date(2026, 7, 27))
        assert (occ[0].end - occ[0].start).total_seconds() == 90 * 60
