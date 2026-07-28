"""The daily regimen — what you take or do today.

**A filtered call into the rule evaluator**, and nothing more. "What is expected
on day D" is one question across doses, activities, occasions and work; the
regimen is that question restricted to the clinical kinds and rendered for the
health surfaces. Cadence, liveness and slots all live in ``rules.py`` now, so
there is one place where a cadence can be wrong.

What stays here is what is genuinely the regimen's own: which kinds it shows,
the display categories (`medication` / `supplement` / `activity`), and the dedupe
per (medication, slot) so a drug shared by two live protocols appears once.
"""

from __future__ import annotations

from datetime import date

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from wild_life.models.health import Medication
from wild_life.models.protocols import Protocol
from wild_life.models.routines import Routine
from wild_life.rules import expected_days as _rule_expected_days
from wild_life.rules import expected_on, is_due
from wild_life.schemas.health import RegimenEntry

__all__ = ["compute_regimen", "expected_days", "is_due"]

# The kinds of rule the regimen is about. An `occasion` rule is equally a rule and
# equally evaluated by `rules.py`, and equally not something the health surfaces
# show — which is the point of filtering by kind rather than by which FK is set.
REGIMEN_KINDS = frozenset({"dose", "activity"})


def _display_kind(routine: Routine, med: Medication | None) -> str:
    """The category the health UI groups by — not the MomentKind the rule generates.

    Kept distinct on purpose. `rules.kind` says what act a generated moment *is*
    (`dose`, `activity`); this says how to present it, since a supplement reads
    differently from a prescription. Conflating them would put a display concern
    inside the vocabulary that carries the timeline, which is how `note_type` and
    `event_type` both started.
    """
    if med is not None:
        return "supplement" if med.med_type == "supplement" else "medication"
    return "activity" if routine.protocol_id is not None else "routine"


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
        if routine.kind not in REGIMEN_KINDS:
            continue
        # Liveness, cadence and slots in one call — including the slotless habit,
        # which still expects one checkable occurrence.
        slots = expected_on(routine, proto, day)
        if not slots:
            continue
        label = med.name if med is not None else (routine.activity or routine.name)
        for slot in slots:
            key = (med.id, slot) if med is not None else (routine.id, slot)
            if key in seen:  # first live source wins the attribution
                continue
            seen[key] = RegimenEntry(
                routine_id=routine.id,
                label=label or "Routine",
                kind=_display_kind(routine, med),
                slot=slot,
                medication_id=med.id if med is not None else None,
                amount=float(routine.amount) if routine.amount is not None else None,
                unit=routine.unit,
                source_protocol_id=proto.id if proto is not None else None,
                source_protocol_name=proto.name if proto is not None else None,
            )
    return list(seen.values())


def expected_days(routine: Routine, anchor: date | None, start: date, end: date) -> int:
    """How many days in [start, end] the cadence is due (for adherence).

    Re-exported rather than reimplemented: adherence and the regimen disagreeing
    about what "due" means is the failure mode worth spending an indirection on.
    """
    return _rule_expected_days(routine, anchor, start, end)
