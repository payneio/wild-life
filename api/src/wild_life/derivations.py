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
is absent on purpose: of 36 projects only 2 have ever completed, so it would draw a
chart out of two points and look broken rather than empty.
`time_allocation` — where the week actually went — is the most valuable of the lot
and is blocked on event rooting (50 of 1,329), not on this module.
"""

from collections.abc import Awaitable, Callable
from dataclasses import dataclass
from datetime import date, datetime, time, timedelta, timezone

from sqlalchemy import and_, func, or_, select
from sqlalchemy.orm import aliased
from sqlalchemy.ext.asyncio import AsyncSession

from wild_life import regimen
from wild_life.hierarchy import tasks_rooted_at
from wild_life.models.metrics import Metric, MetricEntry
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

    Rolled up through the hierarchy rather than matched on the task's own FK for
    the root's level. That used to be the honest reading, because tasks carried
    area, program and project ids at once and a roll-up would have double-counted
    the ones carrying several. They carry one now — the extra copies were what
    rotted — so the roll-up is both necessary and exact.
    """
    rooted = tasks_rooted_at(metric.entity_type, metric.entity_id)
    if rooted is None:
        return []

    weeks = _week_starts()
    stamps = (
        (
            await session.execute(
                select(Task.completed_at).where(
                    rooted,
                    Task.status == "completed",
                    Task.completed_at.isnot(None),
                    Task.completed_at
                    >= datetime.combine(weeks[0], time.min, tzinfo=timezone.utc),
                )
            )
        )
        .scalars()
        .all()
    )
    # Bucketed here rather than by `date_trunc('week', …)` in SQL, deliberately.
    # The session runs in UTC and `_week_starts` builds *local* Mondays, so the
    # database would file seven hours of every week into the neighbouring one —
    # a Sunday evening's work landing in the week after. Same mismatch 1f4b330
    # fixed for staleness: compare like for like, and do it in one place.
    counts: dict[date, int] = {}
    for stamp in stamps:
        day = stamp.astimezone().date()
        counts[day - timedelta(days=day.weekday())] = (
            counts.get(day - timedelta(days=day.weekday()), 0) + 1
        )
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


async def _paired(
    session: AsyncSession, metric: Metric
) -> list[tuple[datetime, float, float]]:
    """The two operands' readings, paired by the occasion that produced them.

    This is the whole reason a group reading is a row. A ratio is a relationship
    between two values *from one act* — without an occasion to join on, pairing
    would mean guessing which cholesterol goes with which HDL by nearness of
    timestamp, and the answer would quietly change as readings accumulated.

    Entries taken outside any group fall back to an exact `recorded_at` match, so
    two numbers typed in the same submit still pair.
    """
    if metric.numerator_metric_id is None or metric.denominator_metric_id is None:
        return []

    num = aliased(MetricEntry)
    den = aliased(MetricEntry)
    # Join on the occasion when both have one, else on the exact instant. Never
    # on the day: several readings a day is the case `recorded_at` exists for.
    same_occasion = and_(
        num.group_reading_id.is_not(None),
        num.group_reading_id == den.group_reading_id,
    )
    rows = (
        await session.execute(
            select(num.recorded_at, num.value, den.value)
            .join(
                den,
                or_(same_occasion, num.recorded_at == den.recorded_at),
            )
            .where(
                num.metric_id == metric.numerator_metric_id,
                den.metric_id == metric.denominator_metric_id,
            )
            .order_by(num.recorded_at)
        )
    ).all()
    return [(at, n, d) for at, n, d in rows]


async def _ratio(session: AsyncSession, metric: Metric) -> list[Point]:
    """One metric divided by another, per occasion.

    A point exists only where *both* operands do. That is the correction, not a
    limitation: the spreadsheet this replaced carried a stored `TRI/HDL` of 120
    on a draw with no triglycerides at all.
    """
    return [
        Point(recorded_at=at, value=n / d)
        for at, n, d in await _paired(session, metric)
        if d
    ]


async def _percent(session: AsyncSession, metric: Metric) -> list[Point]:
    """The same, as a percentage — iron saturation, savings rate."""
    return [
        Point(recorded_at=at, value=n / d * 100)
        for at, n, d in await _paired(session, metric)
        if d
    ]


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
        Derivation(
            key="ratio",
            label="Ratio of two metrics",
            unit="",
            description="One metric divided by another, paired within a reading.",
            compute=_ratio,
        ),
        Derivation(
            key="percent",
            label="Percent of two metrics",
            unit="%",
            description="One metric as a percentage of another, within a reading.",
            compute=_percent,
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
