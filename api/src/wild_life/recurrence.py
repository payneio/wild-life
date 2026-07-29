"""The edge between iCalendar's recurrence and ours.

Rules are ours; iCal lives at the edge (decision 8). This module is that edge, and
it has exactly two jobs:

- **translate** a wire ``RRULE`` into our cadence, or say plainly that it cannot.
  Our cadence is the FHIR Timing subset every rule already speaks — weekdays,
  every-N-days, a validity window — so a rule that translates joins the one
  evaluator and can be asked about alongside a dose or a habit.
- **expand** a wire rule into the occurrences it names. This is the ground truth:
  it is what an inbound rule we cannot translate gets materialised as, and it is
  the oracle the translation is *proved* against rather than asserted equal to.

The refusal is the important half. A translation that quietly approximates is
worse than none, because the calendar would then disagree with the sender about
what was scheduled — and the sender is another system with its own users. So
anything outside the subset is rejected by name, and materialised instead.

What is deliberately refused, measured against all 74 recurring events:

- ``FREQ`` other than DAILY/WEEKLY (9 YEARLY, 3 MONTHLY). Our cadence counts days
  and names weekdays; "the first Saturday of the month" is neither.
- ``COUNT``. It *could* be turned into an end date by expanding, but a count and
  a date mean different things the moment anything else changes — widen the
  weekdays and a COUNT rule ends sooner, an UNTIL rule does not. Storing the
  derived date would silently pick one.
- ``INTERVAL`` > 1 together with several ``BYDAY``. "Every other week on Tuesday
  and Thursday" needs a notion of which week; a modulo over days has none.
- Any ``BYSETPOS``/``BYMONTH``/``BYMONTHDAY``/``BYYEARDAY``, and ordinal BYDAY
  (``1SA``), for the same reason as MONTHLY.
"""

from __future__ import annotations

from dataclasses import dataclass
from datetime import UTC, date, datetime, timedelta

from dateutil.rrule import rrulestr

# Ours, in the order `rules._WEEKDAYS` indexes them (Monday first, per
# `date.weekday()`), paired with iCal's two-letter codes.
_ICAL_DAYS = {
    "MO": "mon",
    "TU": "tue",
    "WE": "wed",
    "TH": "thu",
    "FR": "fri",
    "SA": "sat",
    "SU": "sun",
}
_OURS = ("mon", "tue", "wed", "thu", "fri", "sat", "sun")

# Parts we understand. Anything else in the rule means we do not understand the
# rule — listing what we accept, rather than what we reject, is what keeps a new
# iCal part from being silently ignored.
_KNOWN_PARTS = {"FREQ", "INTERVAL", "BYDAY", "UNTIL", "WKST"}


@dataclass(frozen=True)
class Cadence:
    """Our expression of a recurrence: what a rule's columns would hold."""

    days_of_week: list[str]
    interval_days: int
    end_date: date | None


def _parts(rrule: str) -> dict[str, str]:
    out: dict[str, str] = {}
    for chunk in rrule.replace("RRULE:", "").split(";"):
        if not chunk or "=" not in chunk:
            continue
        key, _, value = chunk.partition("=")
        out[key.strip().upper()] = value.strip()
    return out


def _until_date(raw: str, dtstart: datetime) -> date | None:
    """The last day an occurrence may fall on, given an UNTIL.

    **UNTIL is an instant, not a day**, and the difference is a whole occurrence.
    `UNTIL=20240411T065959Z` on a series that meets at 14:00 does *not* include
    the 11th: 14:00 is past 06:59:59. Truncating to `.date()` added a meeting
    that never happened, to eleven of the seventy-four real rules. Our cadence
    only has a day to work with, so the day has to be the last one that actually
    admits an occurrence.
    """
    # A DATE-valued UNTIL (no time) means the whole of that day.
    if len(raw) == 8:
        try:
            return datetime.strptime(raw, "%Y%m%d").date()
        except ValueError:
            return None
    try:
        instant = datetime.strptime(raw, "%Y%m%dT%H%M%SZ").replace(tzinfo=UTC)
    except ValueError:
        try:
            instant = datetime.strptime(raw, "%Y%m%dT%H%M%S").replace(tzinfo=UTC)
        except ValueError:
            return None
    zone = dtstart.tzinfo or UTC
    candidate = instant.astimezone(zone).date()
    # Every occurrence shares the series' time of day; keep the candidate only if
    # an occurrence on it would still land on or before the deadline.
    on_that_day = datetime.combine(candidate, dtstart.time(), tzinfo=zone)
    return candidate if on_that_day <= instant else candidate - timedelta(days=1)


def translate(rrule: str, dtstart: datetime) -> Cadence | None:
    """Our cadence for this wire rule, or ``None`` if it cannot be said.

    ``dtstart`` matters: a WEEKLY rule with no BYDAY recurs on the weekday its
    series starts on, which is information the rule string does not carry.
    """
    if not rrule:
        return None
    parts = _parts(rrule)
    if set(parts) - _KNOWN_PARTS:
        return None
    freq = parts.get("FREQ", "").upper()
    if freq not in ("DAILY", "WEEKLY"):
        return None

    try:
        interval = int(parts.get("INTERVAL", "1"))
    except ValueError:
        return None
    if interval < 1:
        return None

    byday_raw = parts.get("BYDAY", "")
    byday = [d.strip().upper() for d in byday_raw.split(",") if d.strip()]
    # An ordinal ("1SA", "-1FR") selects a week within a month; we cannot say it.
    if any(d not in _ICAL_DAYS for d in byday):
        return None

    end_date = _until_date(parts["UNTIL"], dtstart) if "UNTIL" in parts else None

    if freq == "DAILY":
        # BYDAY on a DAILY rule is a filter ("every day, but only weekdays").
        # Expressible in principle, but it never occurs here and guessing at an
        # untested path is how a translation quietly goes wrong.
        if byday:
            return None
        return Cadence(days_of_week=[], interval_days=interval, end_date=end_date)

    # WEEKLY. With no BYDAY the series recurs on the weekday it starts on.
    days = [_ICAL_DAYS[d] for d in byday] or [_OURS[dtstart.weekday()]]
    if interval > 1:
        if len(days) > 1:
            return None
        # Every N weeks on one weekday: the weekday filter and a stride of 7N
        # days from the anchor agree exactly, because the anchor *is* that
        # weekday (`rules.anchor_for` uses the rule's start).
        return Cadence(days_of_week=days, interval_days=7 * interval, end_date=end_date)
    return Cadence(days_of_week=days, interval_days=1, end_date=end_date)


def _utc_until(rrule: str, dtstart: datetime) -> str:
    """Give a date-valued UNTIL the UTC time RFC 5545 requires of it.

    One real rule reads ``FREQ=DAILY;UNTIL=20251106``. Against a timezone-aware
    DTSTART, dateutil refuses that outright — correctly, per §3.3.10 — so the
    expander would raise on a rule the sender is perfectly happy with. A DATE
    UNTIL means the whole of that day, which is what the end of it says.
    """
    if dtstart.tzinfo is None:
        return rrule
    parts = _parts(rrule)
    raw = parts.get("UNTIL")
    if raw is None or len(raw) != 8:
        return rrule
    return ";".join(
        f"UNTIL={raw}T235959Z" if k == "UNTIL" else f"{k}={v}" for k, v in parts.items()
    )


def expand(
    rrule: str,
    dtstart: datetime,
    *,
    until: datetime,
    exdates: list[str] | None = None,
) -> list[datetime]:
    """The occurrences the wire rule names, up to ``until``.

    Ground truth. Used to materialise a rule we cannot translate — decision 8's
    "an inbound rule we cannot translate is materialised as the occurrences we
    were given" — and to prove the ones we can.
    """
    rule = rrulestr(_utc_until(rrule, dtstart), dtstart=dtstart)
    dropped = {_normalise(x) for x in (exdates or [])}
    return [
        occ
        for occ in rule.between(dtstart - timedelta(seconds=1), until, inc=True)
        if _normalise(occ.isoformat()) not in dropped
    ]


def _normalise(stamp: str | datetime) -> str:
    """EXDATEs are compared as instants, not as strings.

    The same moment is written half a dozen ways across exporters — with a Z, an
    offset, or naive local — and 13 events carry them. Comparing the text would
    silently keep an occurrence the sender cancelled.
    """
    raw = stamp if isinstance(stamp, str) else stamp.isoformat()
    text = raw.strip().replace("Z", "+00:00")
    try:
        parsed = datetime.fromisoformat(text)
    except ValueError:
        return raw
    if parsed.tzinfo is None:
        parsed = parsed.replace(tzinfo=UTC)
    return parsed.astimezone(UTC).isoformat()


def to_rrule(cadence: Cadence, dtstart: datetime) -> str | None:
    """Our cadence as a wire rule, or ``None`` when RFC 5545 cannot state it.

    The other direction, and it has the same duty of refusal. Our expression can
    say things RRULE cannot — an anchored cadence counting from the last
    occurrence rather than from a calendar grid — and paraphrasing one of those
    into the nearest RRULE would hand a guest's calendar a series that drifts
    from ours. Decision 8's answer for that case is `RDATE`: export the
    occurrences themselves rather than a rule that lies about them.

    What round-trips exactly (`translate(to_rrule(c)) == c`, which the tests
    assert) is what we accept inbound: weekdays, every-N-days, and an end.
    """
    days = [
        code
        for code, ours in _ICAL_DAYS.items()
        if ours in (cadence.days_of_week or [])
    ]
    parts: list[str] = []

    if cadence.days_of_week:
        # A weekday filter is FREQ=WEEKLY. With a stride of 1 the filter does all
        # the work — every week, on these days — which is what `translate` emits
        # for a plain `FREQ=WEEKLY;BYDAY=…`. Any other stride survives only as a
        # weekly INTERVAL, and so only if it is a whole number of weeks.
        weeks = 1 if cadence.interval_days == 1 else cadence.interval_days // 7
        if cadence.interval_days != 1 and cadence.interval_days % 7 != 0:
            return None
        if weeks > 1 and len(days) > 1:
            # "Every other week on Tue and Thu" needs a notion of which week,
            # and ours is a modulo over days — the same case we refuse inbound.
            return None
        parts.append("FREQ=WEEKLY")
        if weeks > 1:
            parts.append(f"INTERVAL={weeks}")
        parts.append(f"BYDAY={','.join(days)}")
    else:
        parts.append("FREQ=DAILY")
        if cadence.interval_days > 1:
            parts.append(f"INTERVAL={cadence.interval_days}")

    if cadence.end_date is not None:
        # UNTIL is an instant in UTC, and must not cut the last occurrence: the
        # end date is the last *day* one may fall on, so the deadline is the end
        # of it. (`_until_date` reads this back exactly.)
        zone = dtstart.tzinfo or UTC
        last = datetime.combine(cadence.end_date, dtstart.time(), tzinfo=zone)
        parts.append(f"UNTIL={last.astimezone(UTC).strftime('%Y%m%dT%H%M%SZ')}")

    return ";".join(parts)
