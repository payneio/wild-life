"""Routes for outcomes, and the evaluation that says where each one stands."""

from datetime import date, datetime, timezone
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from wild_life.db.session import get_session
from wild_life.derivations import series_for
from wild_life.models.links import EntityLink
from wild_life.models.metrics import Metric, MetricEntry
from wild_life.models.outcomes import Outcome
from wild_life.routers.crud import crud_router
from wild_life.schemas.outcomes import (
    Evaluation,
    OutcomeCreate,
    OutcomeRead,
    OutcomeUpdate,
)

router = APIRouter()

router.include_router(
    crud_router(
        prefix="/outcomes",
        tag="outcomes",
        model=Outcome,
        create_schema=OutcomeCreate,
        read_schema=OutcomeRead,
        update_schema=OutcomeUpdate,
        order_by=Outcome.created_at.desc(),
    )
)

extra = APIRouter(prefix="/outcomes", tags=["outcomes"])

# How long past its cadence a reading may be before the verdict stops trusting it.
STALE_GRACE = {
    "daily": 2,
    "weekly": 10,
    "monthly": 45,
    "quarterly": 120,
    "yearly": 450,
}


async def _get_outcome(session: AsyncSession, outcome_id: UUID) -> Outcome:
    outcome = await session.get(Outcome, outcome_id)
    if outcome is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, detail="Outcome not found")
    return outcome


def _in_band(value: float, lo: float | None, hi: float | None) -> bool:
    """Inside the claim. Either bound may be absent — "under 100" is a hi alone."""
    if lo is not None and value < lo:
        return False
    if hi is not None and value > hi:
        return False
    return True


def _target_edge(outcome: Outcome) -> float | None:
    """The number a target is travelling towards — whichever bound it must reach."""
    if outcome.baseline is None:
        return (
            outcome.target_max if outcome.target_max is not None else outcome.target_min
        )
    # Aiming down means the ceiling is the finish line; aiming up, the floor.
    if outcome.target_max is not None and outcome.target_max < outcome.baseline:
        return outcome.target_max
    if outcome.target_min is not None and outcome.target_min > outcome.baseline:
        return outcome.target_min
    return outcome.target_max if outcome.target_max is not None else outcome.target_min


@extra.get("/{outcome_id}/evaluation", response_model=Evaluation)
async def evaluate_outcome(
    outcome_id: UUID, session: AsyncSession = Depends(get_session)
) -> dict:
    """Where an outcome stands right now, computed — never stored.

    One rule per kind: a standard is in its band or breached, a target is a
    fraction of the way from baseline to the edge (and on pace or behind), a
    deliverable is accepted or outstanding. An outcome with no metric is
    `unmeasured`, which is a legitimate state and not a failure.
    """
    outcome = await _get_outcome(session, outcome_id)
    today = date.today()

    advanced_by = await session.scalar(
        select(func.count())
        .select_from(EntityLink)
        .where(
            EntityLink.target_type == "outcome",
            EntityLink.target_id == outcome_id,
            EntityLink.relation == "advances",
        )
    )

    result: dict = {
        "state": "unmeasured",
        "latest_value": None,
        "latest_at": None,
        "is_stale": False,
        "target_min": outcome.target_min,
        "target_max": outcome.target_max,
        "reference_min": None,
        "reference_max": None,
        "progress": None,
        "baseline": outcome.baseline,
        "days_remaining": None,
        "pace_required": None,
        "pace_actual": None,
        "advanced_by": advanced_by or 0,
    }

    if outcome.by_when is not None:
        result["days_remaining"] = (outcome.by_when - today).days

    if outcome.kind == "deliverable":
        result["state"] = "satisfied" if outcome.satisfied_at else "outstanding"
        return result

    if outcome.metric_id is None:
        return result

    metric = await session.get(Metric, outcome.metric_id)
    if metric is not None:
        result["reference_min"] = metric.reference_min
        result["reference_max"] = metric.reference_max

    # A derived metric has no entries — its latest reading is the tail of the
    # computed series. Everything below this line is indifferent to which it was.
    if metric is not None and metric.source == "derived":
        points = await series_for(session, metric)
        latest = (points[-1].value, points[-1].recorded_at) if points else None
    else:
        latest = (
            await session.execute(
                select(MetricEntry.value, MetricEntry.recorded_at)
                .where(MetricEntry.metric_id == outcome.metric_id)
                .order_by(MetricEntry.recorded_at.desc())
                .limit(1)
            )
        ).first()
    if latest is None:
        # Bound to an instrument that has never been read — distinct from having
        # no instrument at all, and the review dashboard treats them differently.
        result["state"] = "no_readings"
        return result

    value, recorded_at = latest
    result["latest_value"] = value
    result["latest_at"] = recorded_at

    cadence = metric.measurement_frequency if metric else None
    grace = STALE_GRACE.get(cadence) if cadence else None
    if grace is not None:
        age = (datetime.now(timezone.utc) - recorded_at).days
        result["is_stale"] = age > grace

    if outcome.kind == "standard":
        result["state"] = (
            "met"
            if _in_band(value, outcome.target_min, outcome.target_max)
            else "breached"
        )
        return result

    # target
    edge = _target_edge(outcome)
    if edge is None:
        result["state"] = "unmeasured"
        return result
    if _in_band(value, outcome.target_min, outcome.target_max):
        result["state"] = "achieved"
        result["progress"] = 100.0
        return result

    if outcome.baseline is not None and outcome.baseline != edge:
        span = edge - outcome.baseline
        result["progress"] = round(
            min(100.0, max(0.0, (value - outcome.baseline) / span * 100.0)), 1
        )

    if outcome.by_when is None:
        result["state"] = "in_progress"
        return result
    if result["days_remaining"] is not None and result["days_remaining"] < 0:
        result["state"] = "overdue"
        return result

    # On pace = far enough along for how much of the window has elapsed. Without a
    # baseline there is no distance to have covered, so pace can't be judged.
    if outcome.baseline is not None and outcome.baseline != edge:
        elapsed = (today - outcome.created_at.date()).days
        window = (outcome.by_when - outcome.created_at.date()).days
        result["pace_required"] = round(
            abs(edge - outcome.baseline) / max(window, 1), 4
        )
        result["pace_actual"] = round(
            abs(value - outcome.baseline) / max(elapsed, 1), 4
        )
        expected = 100.0 * elapsed / window if window > 0 else 100.0
        result["state"] = (
            "on_pace" if (result["progress"] or 0) >= expected else "behind"
        )
    else:
        result["state"] = "in_progress"
    return result


router.include_router(extra)
