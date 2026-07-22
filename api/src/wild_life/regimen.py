"""The daily regimen — what you do/take today — derived from Routines.

A Routine is the single stored unit (a med dose, supplement, activity, or habit);
the *regimen* is the derived set of routines due in a time window. Each is defined
in one place, so nothing drifts. Visibility follows the routine's owner:

- **protocol-attached** (``protocol_id``) → in force only while that protocol is
  ``active`` and today is inside its window.
- **medication** (``medication_id``, no protocol) → in force while the medication
  is ``active`` and inside its window.
- **standalone** (habit) → in force while the routine's own ``status`` is active
  and inside its own window.

On top of that each routine carries an FHIR-style cadence (``days_of_week`` +
``interval_days``); ``as_needed`` (PRN) routines are never on the scheduled list.
Deduped per (medication, slot) so a drug shared by two live protocols shows once.
"""

from __future__ import annotations

from datetime import date, timedelta

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from wild_life.models.health import Medication, Protocol
from wild_life.models.routines import Routine
from wild_life.schemas.health import RegimenEntry

_WEEKDAYS = ("mon", "tue", "wed", "thu", "fri", "sat", "sun")


def _in_window(start: date | None, end: date | None, day: date) -> bool:
    return (start is None or start <= day) and (end is None or end >= day)


def is_due(routine: Routine, anchor: date | None, day: date) -> bool:
    """Whether the routine's cadence lands on ``day`` (FHIR Timing subset)."""
    if routine.days_of_week and _WEEKDAYS[day.weekday()] not in routine.days_of_week:
        return False
    interval = routine.interval_days or 1
    if interval > 1:
        base = anchor or day
        if (day - base).days % interval != 0:
            return False
    return True


def _kind(routine: Routine, med: Medication | None) -> str:
    if med is not None:
        return "supplement" if med.med_type == "supplement" else "medication"
    return "activity" if routine.protocol_id is not None else "routine"


def _live_anchor(
    routine: Routine, med: Medication | None, proto: Protocol | None, day: date
) -> tuple[bool, date | None]:
    """(is_live_today, cadence_anchor) — anchor is the owner's start date."""
    if proto is not None:
        live = proto.status == "active" and _in_window(
            proto.start_date, proto.end_date, day
        )
        return live, proto.start_date
    if med is not None:
        live = med.status == "active" and _in_window(med.start_date, med.end_date, day)
        return live, med.start_date
    live = routine.status == "active" and _in_window(
        routine.start_date, routine.end_date, day
    )
    return live, routine.start_date


async def compute_regimen(session: AsyncSession, day: date) -> list[RegimenEntry]:
    """The routines due on ``day`` (see module docstring for the rule)."""
    rows = (
        await session.execute(
            select(Routine, Medication, Protocol)
            .outerjoin(Medication, Medication.id == Routine.medication_id)
            .outerjoin(Protocol, Protocol.id == Routine.protocol_id)
            .order_by(Routine.sort_order)
        )
    ).all()

    seen: dict[tuple, RegimenEntry] = {}
    for routine, med, proto in rows:
        if routine.as_needed:  # PRN — taken on demand, not scheduled
            continue
        live, anchor = _live_anchor(routine, med, proto, day)
        if not live:
            continue
        if anchor is None:
            anchor = routine.created_at.date()
        if not is_due(routine, anchor, day):
            continue
        label = med.name if med is not None else (routine.activity or routine.name)
        # A slotless habit still gets one checkable occurrence.
        for slot in routine.timing or [""]:
            key = (med.id, slot) if med is not None else (routine.id, slot)
            if key in seen:  # first live source wins the attribution
                continue
            seen[key] = RegimenEntry(
                routine_id=routine.id,
                label=label or "Routine",
                kind=_kind(routine, med),
                slot=slot,
                medication_id=med.id if med is not None else None,
                amount=float(routine.amount) if routine.amount is not None else None,
                form=med.form if med is not None else None,
                source_protocol_id=proto.id if proto is not None else None,
                source_protocol_name=proto.name if proto is not None else None,
            )
    return list(seen.values())


def expected_days(routine: Routine, anchor: date | None, start: date, end: date) -> int:
    """How many days in [start, end] the routine's cadence is due (for adherence)."""
    total = 0
    d = start
    while d <= end:
        if is_due(routine, anchor, d):
            total += 1
        d += timedelta(days=1)
    return total
