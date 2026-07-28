"""The rule evaluator: what is expected on day D, for everything that recurs.

One question, one answer. Before this there were three cadence expressions —
``Routine``'s FHIR Timing subset, ``Event.recurrence`` as an RRULE string and
``Task.recurrence`` as free text — and nothing that could ask across them. Two of
the three had no evaluator at all: the calendar's recurrence was expanded in the
browser by FullCalendar, and a task's was a label nothing read.

Two properties are load-bearing:

- **Rules are computed, never materialised** (decision 10). This module returns
  what a rule *expects* on a day; it writes nothing. A projected occurrence
  becomes a row only when something happens to it — you did it, moved it, or
  withdrew it — which is what makes the override row unnecessary. iCal needs
  ``RECURRENCE-ID`` + ``EXDATE`` because a VEVENT series has no other way to say
  "this one is different"; we have one, so those live on the projection
  (``calendar_records``) for the wire and nowhere else.
- **Liveness is the rule's, narrowed by its container.** It used to be the
  protocol's alone, which is why every routine had to have a protocol. A rule is
  in force when its own status is live and the day is inside its own window; a
  rule that belongs to a protocol must additionally be inside the protocol's.
"""

from __future__ import annotations

from dataclasses import dataclass
from datetime import UTC, date, datetime, time, timedelta, tzinfo
from zoneinfo import ZoneInfo, ZoneInfoNotFoundError

from wild_life.models.protocols import Protocol
from wild_life.models.routines import Routine

_WEEKDAYS = ("mon", "tue", "wed", "thu", "fri", "sat", "sun")

# Statuses that stop a rule expecting anything. `status` already carries this —
# adding the `paused` boolean the target shape sketched would have been a second
# source of truth beside a column that already says `paused`, which is the exact
# duplication this migration keeps deleting elsewhere.
_DORMANT = frozenset({"paused", "archived", "completed", "cancelled"})


def in_window(start: date | None, end: date | None, day: date) -> bool:
    return (start is None or start <= day) and (end is None or end >= day)


def is_live(rule: Routine, protocol: Protocol | None, day: date) -> bool:
    """Whether the rule is in force on ``day``, before asking about cadence."""
    if rule.status in _DORMANT:
        return False
    if not in_window(rule.start_date, rule.end_date, day):
        return False
    if protocol is not None:
        return not protocol.paused and in_window(
            protocol.start_date, protocol.end_date, day
        )
    return True


def anchor_for(rule: Routine, protocol: Protocol | None) -> date:
    """The day an every-N-days cadence counts from.

    The container's start when there is one — a protocol that begins on a Tuesday
    puts its every-other-day step on Tuesdays — then the rule's own, then the day
    it was written down, which is the only remaining honest answer.
    """
    if protocol is not None and protocol.start_date is not None:
        return protocol.start_date
    if rule.start_date is not None:
        return rule.start_date
    return rule.created_at.date()


def is_due(rule: Routine, anchor: date | None, day: date) -> bool:
    """Whether the rule's cadence lands on ``day`` (FHIR Timing subset)."""
    if rule.days_of_week and _WEEKDAYS[day.weekday()] not in rule.days_of_week:
        return False
    interval = rule.interval_days or 1
    if interval > 1:
        base = anchor or day
        if (day - base).days % interval != 0:
            return False
    return True


def expected_on(rule: Routine, protocol: Protocol | None, day: date) -> list[str]:
    """The slots this rule expects on ``day`` — empty when it expects nothing.

    Slots are first-class: a twice-daily medication expects two occurrences, and
    each is separately completable. A rule with no slots still expects one
    occurrence, because a habit you either did or didn't is not a rule that
    expects nothing.
    """
    if not is_live(rule, protocol, day):
        return []
    if not is_due(rule, anchor_for(rule, protocol), day):
        return []
    return list(rule.timing or [""])


def expected_days(rule: Routine, anchor: date | None, start: date, end: date) -> int:
    """How many days in [start, end] the cadence is due (for adherence).

    Cadence only — deliberately not liveness. Adherence divides what you did by
    what was expected *of the schedule*, and a protocol paused after the fact
    would otherwise retroactively improve every past week.
    """
    total = 0
    d = start
    while d <= end:
        if is_due(rule, anchor, d):
            total += 1
        d += timedelta(days=1)
    return total


@dataclass(frozen=True)
class Occurrence:
    """One projected occurrence of a rule: when it is expected, and for how long.

    Never stored. A projected occurrence becomes a row only when something
    happens to it (decision 10), which is what makes the override row that iCal
    needs unnecessary here.
    """

    start: datetime
    end: datetime | None
    slot: str


def _zone(rule: Routine) -> tzinfo:
    """The zone a rule's slots are wall times in.

    Null means what the app has always done — treat the stored instant as
    authoritative and expand in UTC. That is all an already-synced series can
    honestly claim, because its TZID was discarded at import.
    """
    if not rule.timezone:
        return UTC
    try:
        return ZoneInfo(rule.timezone)
    except (ZoneInfoNotFoundError, ValueError):
        # A zone the host does not know is a data problem, not a reason to
        # produce no calendar. Fall back to the historical behaviour.
        return UTC


def _slot_time(slot: str) -> time | None:
    """A clock slot ("14:30") as a time. Named slots ("breakfast") have none."""
    try:
        hh, _, mm = slot.partition(":")
        return time(int(hh), int(mm))
    except (TypeError, ValueError):
        return None


def project(
    rule: Routine, protocol: Protocol | None, start: date, end: date
) -> list[Occurrence]:
    """Every occurrence this rule expects in [start, end], as instants.

    **This is where the zone earns its column.** Each occurrence is built as a
    wall time in the rule's zone and only then becomes an instant, so a weekly
    9am meeting is 9am on both sides of a daylight-saving boundary. Building it
    from a stored UTC instant instead — which is what the calendar does today —
    moves the meeting by an hour for half the year.
    """
    zone = _zone(rule)
    out: list[Occurrence] = []
    day = start
    while day <= end:
        for slot in expected_on(rule, protocol, day):
            at = _slot_time(slot)
            if at is None:
                continue
            begins = datetime.combine(day, at, tzinfo=zone)
            out.append(
                Occurrence(
                    start=begins,
                    end=(
                        begins + timedelta(minutes=rule.expected_minutes)
                        if rule.expected_minutes
                        else None
                    ),
                    slot=slot,
                )
            )
        day += timedelta(days=1)
    return out
