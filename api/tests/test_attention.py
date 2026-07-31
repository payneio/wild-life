"""Attention fails by not being examined — A1, A10, A11.

The predicate this replaces measured inactivity: areas with no open projects or
tasks. That is a report about work, and it cannot see the case that matters — a
scope busy with work nobody has looked at. These pin the difference.

Pure unit tests over `Attention`, so they need no database: the class takes the
hierarchy and the examination log as arguments precisely so the rules can be
checked without standing one up.
"""

import uuid
from datetime import date, datetime, timezone
from types import SimpleNamespace

from wild_life.attention import Attention, scope_ref

TODAY = date(2026, 8, 1)


def _scope(**kw):  # noqa: ANN003, ANN202
    return SimpleNamespace(id=uuid.uuid4(), name="s", review_frequency=None, **kw)


def _hierarchy(
    area_cadence=None, program_cadence=None, project_cadence=None, examined=None
):  # noqa: ANN001, ANN202
    area = _scope()
    area.review_frequency = area_cadence
    program = _scope(area_id=area.id)
    program.review_frequency = program_cadence
    project = _scope(program_id=program.id)
    project.review_frequency = project_cadence
    return (
        Attention([area], [program], [project], examined or {}),
        area,
        program,
        project,
    )


class TestCadenceInherits:
    def test_a_scope_with_none_takes_its_parents(self) -> None:
        """A10. 21 of 24 programs declare no cadence; requiring one per node
        would mean declaring it dozens of times to say the same thing."""
        att, area, program, project = _hierarchy(area_cadence="monthly")
        assert att.cadence(scope_ref("program", program.id)) == "monthly"
        assert att.cadence(scope_ref("project", project.id)) == "monthly"

    def test_declaring_one_stops_the_inheritance(self) -> None:
        att, area, program, project = _hierarchy(
            area_cadence="monthly", program_cadence="weekly"
        )
        assert att.cadence(scope_ref("program", program.id)) == "weekly"
        assert att.cadence(scope_ref("project", project.id)) == "weekly"

    def test_no_cadence_anywhere_means_no_expectation(self) -> None:
        """Absent is not the same as long: nothing can be overdue against an
        expectation nobody set."""
        att, _, _, project = _hierarchy()
        assert att.cadence(scope_ref("project", project.id)) is None
        assert att.overdue_by(scope_ref("project", project.id), TODAY) is None


class TestExaminationDoesNotInherit:
    def test_reviewing_a_program_does_not_examine_its_projects(self) -> None:
        """A10's second half. Looking at a program is not looking at each of its
        projects — that is what having altitudes is for. A review may cover both,
        but only by naming both."""
        att, area, program, project = _hierarchy(area_cadence="weekly")
        att._examined[scope_ref("program", program.id)] = date(2026, 7, 31)
        assert att.overdue_by(scope_ref("program", program.id), TODAY) is None
        assert att.overdue_by(scope_ref("project", project.id), TODAY) is not None


class TestNeglectIsNonExamination:
    def test_a_scope_examined_within_its_cadence_is_fine(self) -> None:
        att, area, _, _ = _hierarchy(
            area_cadence="weekly",
            examined={scope_ref("area", uuid.uuid4()): TODAY},
        )
        att._examined[scope_ref("area", area.id)] = date(2026, 7, 30)
        assert att.overdue_by(scope_ref("area", area.id), TODAY) is None

    def test_a_scope_past_its_cadence_reports_how_late(self) -> None:
        att, area, _, _ = _hierarchy(area_cadence="weekly")
        att._examined[scope_ref("area", area.id)] = date(2026, 7, 1)
        # due 8 July, today is 1 August
        assert att.overdue_by(scope_ref("area", area.id), TODAY) == 24

    def test_never_examined_is_due_one_cadence_after_it_existed(self) -> None:
        """Not one cadence ago. A scope created yesterday under a monthly cadence
        is not a month overdue — reporting that is a failure nobody could have
        avoided, and it was what the first version of this did."""
        att, area, _, _ = _hierarchy(area_cadence="monthly")
        att._born[scope_ref("area", area.id)] = date(2026, 7, 31)
        assert att.overdue_by(scope_ref("area", area.id), TODAY) is None

        att._born[scope_ref("area", area.id)] = date(2026, 6, 1)
        assert att.overdue_by(scope_ref("area", area.id), TODAY) == 30

    def test_a_busy_scope_is_still_neglected_if_unexamined(self) -> None:
        """The case the old inactivity predicate could not report, and the reason
        it was replaced."""
        att, area, _, _ = _hierarchy(area_cadence="weekly")
        # No examination recorded; whether work is happening inside is not asked.
        assert att.overdue_by(scope_ref("area", area.id), TODAY) is not None


class TestOnlyCompletedReviewsExamine:
    def test_an_open_review_examines_nothing(self) -> None:
        """Scheduling a review must not discharge the obligation it was
        scheduled to meet."""
        pending = SimpleNamespace(completed_at=None, entities_reviewed=["area:x"])
        assert Attention.examined_from([pending]) == {}

    def test_the_latest_completed_review_wins(self) -> None:
        older = SimpleNamespace(
            completed_at=datetime(2026, 7, 1, tzinfo=timezone.utc),
            entities_reviewed=["area:x"],
        )
        newer = SimpleNamespace(
            completed_at=datetime(2026, 7, 30, tzinfo=timezone.utc),
            entities_reviewed=["area:x"],
        )
        assert Attention.examined_from([newer, older]) == {"area:x": date(2026, 7, 30)}
