"""The rule evaluator: one answer to "what is expected on day D".

Pure functions over unsaved rows — no database, because the thing under test is
the cadence arithmetic and nothing else. The parity that matters against real
data (``compute_regimen`` unchanged across the generalisation) is checked by
running it, and is recorded in the migration.
"""

from datetime import UTC, date, datetime

from wild_life.models.protocols import Protocol
from wild_life.models.routines import Routine
from wild_life.rules import anchor_for, expected_days, expected_on, is_live

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
        start_date=None,
        end_date=None,
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
