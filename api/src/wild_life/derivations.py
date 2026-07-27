"""Readings the app computes for itself.

Hand-logged measurement does not happen: nineteen typed readings against 1,329
events, 842 notes and 404 completed tasks over the same period. A model where an
outcome can only be measured by a number you remember to enter is a model that
measures one corner of a life and nothing else — which is exactly what the data
showed before this existed, with every metric and every goal in Health.

So a metric can name a *derivation* instead: a computation over rows already
here, evaluated on read, with no entry UI and nothing to remember. The metric's
root says what to compute over — throughput for a program means that program's
completed tasks.

Only computations with data behind them today are registered. `project_cycle_time`
is absent on purpose: 37 projects carry an area but only 2 have ever completed, so
it would draw a chart out of two points and look broken rather than empty.
`time_allocation` — where the week actually went — is the most valuable of the lot
and is blocked on event rooting (50 of 1,329), not on this module.
"""

from collections.abc import Awaitable, Callable
from dataclasses import dataclass
from datetime import date, datetime, time, timedelta, timezone

from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from wild_life import regimen
from wild_life.models.metrics import Metric
from wild_life.models.protocols import Protocol
from wild_life.models.routines import Routine, RoutineInstance
from wild_life.models.tasks import Task

# How far back a derived series runs. Half a year of weeks is enough to see a
# trend without turning a sparkline into a smear.
WEEKS = 26


@dataclass(frozen=True)
class Point:
    """One computed reading. Same shape a manual entry presents to a reader."""

    recorded_at: datetime
    value: float


@dataclass(frozen=True)
class Derivation:
    key: str
    label: str
    unit: str
    description: str
    compute: Callable[[AsyncSession, Metric], Awaitable[list[Point]]]


def _week_starts(count: int = WEEKS) -> list[date]:
    """The Mondays of the last `count` weeks, oldest first."""
    today = date.today()
    monday = today - timedelta(days=today.weekday())
    return [monday - timedelta(weeks=n) for n in range(count - 1, -1, -1)]


def _stamp(day: date) -> datetime:
    """A week's reading is stamped at the end of that week, in UTC.

    Not the start: the value isn't known until the week is over, and stamping it
    early would make a partial week look like a completed one.
    """
    return datetime.combine(day + timedelta(days=6), time(23, 59), tzinfo=timezone.utc)


async def _task_throughput(session: AsyncSession, metric: Metric) -> list[Point]:
    """Tasks completed per week, in whatever the metric is rooted to.

    Matched on the task's own FK for the root's level. Tasks carry area, program
    and project ids (429, 402 and 437 of 447 rows), so the direct match is the
    honest one — inferring a program's tasks through its projects would silently
    double-count the ones that carry both.
    """
    column = {
        "area": Task.area_id,
        "program": Task.program_id,
        "project": Task.project_id,
    }.get(metric.entity_type)
    if column is None:
        return []

    weeks = _week_starts()
    rows = (
        await session.execute(
            select(
                func.date_trunc("week", Task.completed_at).label("wk"),
                func.count(Task.id),
            )
            .where(
                column == metric.entity_id,
                Task.status == "completed",
                Task.completed_at.isnot(None),
                Task.completed_at >= datetime.combine(weeks[0], time.min, tzinfo=timezone.utc),
            )
            .group_by("wk")
        )
    ).all()
    counts = {r[0].date(): int(r[1]) for r in rows if r[0] is not None}
    # Every week in the window, including the zeroes — a gap in the series is
    # information ("nothing shipped"), not a missing reading.
    return [Point(_stamp(w), float(counts.get(w, 0))) for w in weeks]


async def _routine_adherence(session: AsyncSession, metric: Metric) -> list[Point]:
    """Percent of expected routine days actually done, per week.

    Reuses `regimen.expected_days`, the same arithmetic the review dashboard's
    low-adherence check runs on — surfaced as a series rather than recomputed, so
    the two can't drift into disagreeing about what adherence means.
    """
    routines = list(
        (
            await session.execute(
                select(Routine)
                .join(Protocol, Protocol.id == Routine.protocol_id)
                .where(
                    Protocol.program_id == metric.entity_id
                    if metric.entity_type == "program"
                    else Routine.area_id == metric.entity_id
                )
            )
        )
        .scalars()
        .all()
    )
    if not routines:
        return []

    points: list[Point] = []
    for week in _week_starts():
        end = week + timedelta(days=6)
        expected = 0
        for r in routines:
            anchor = r.created_at.date()
            if anchor > end:
                continue
            expected += regimen.expected_days(r, anchor, max(week, anchor), end)
        if expected == 0:
            continue  # nothing was due — a blank, not a zero
        done = (
            await session.scalar(
                select(func.count(func.distinct(RoutineInstance.scheduled_date))).where(
                    RoutineInstance.routine_id.in_([r.id for r in routines]),
                    RoutineInstance.status == "done",
                    RoutineInstance.scheduled_date >= week,
                    RoutineInstance.scheduled_date <= end,
                )
            )
        ) or 0
        points.append(Point(_stamp(week), round(100.0 * done / expected, 1)))
    return points


DERIVATIONS: dict[str, Derivation] = {
    d.key: d
    for d in (
        Derivation(
            key="task_throughput",
            label="Tasks completed per week",
            unit="tasks/week",
            description="How much is actually shipping here, week by week.",
            compute=_task_throughput,
        ),
        Derivation(
            key="routine_adherence",
            label="Routine adherence",
            unit="%",
            description="Of the routine days due this week, how many were done.",
            compute=_routine_adherence,
        ),
    )
}


async def series_for(session: AsyncSession, metric: Metric) -> list[Point]:
    """The computed series for a derived metric; empty for anything else."""
    if metric.source != "derived" or metric.derivation is None:
        return []
    derivation = DERIVATIONS.get(metric.derivation)
    if derivation is None:
        return []
    return await derivation.compute(session, metric)
