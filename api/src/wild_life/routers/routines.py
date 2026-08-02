"""Routes for routines + their completable instances."""

from datetime import date, datetime, timezone
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from wild_life.db.session import get_session
from wild_life.record_moments import forget_for, record_routine_instance
from wild_life.models.routines import Routine, RoutineInstance
from wild_life.routers.crud import crud_router
from wild_life.schemas.routines import (
    DoseLogCreate,
    RoutineCreate,
    RoutineInstanceCreate,
    RoutineInstanceRead,
    RoutineInstanceUpdate,
    RoutineRead,
    RoutineUpdate,
)


async def _record_instance(session: AsyncSession, inst: RoutineInstance) -> None:
    """A logged step becomes a dose or an activity as it is written.

    The rule is fetched because the medication may live on it rather than on the
    instance — reading only the instance is what once counted 37 doses where
    there were 38.
    """
    routine = await session.get(Routine, inst.routine_id) if inst.routine_id else None
    await record_routine_instance(session, inst, routine)


router = APIRouter()

router.include_router(
    crud_router(
        prefix="/routines",
        tag="routines",
        model=Routine,
        create_schema=RoutineCreate,
        read_schema=RoutineRead,
        update_schema=RoutineUpdate,
        order_by=Routine.name,
    )
)
router.include_router(
    crud_router(
        prefix="/routine-instances",
        tag="routines",
        model=RoutineInstance,
        create_schema=RoutineInstanceCreate,
        read_schema=RoutineInstanceRead,
        update_schema=RoutineInstanceUpdate,
        order_by=RoutineInstance.scheduled_date.desc(),
        on_write=_record_instance,
        source_type="routine_instance",
    )
)

extra = APIRouter(prefix="/routines", tags=["routines"])


@extra.get("/{routine_id}/instances", response_model=list[RoutineInstanceRead])
async def list_routine_instances(
    routine_id: UUID, session: AsyncSession = Depends(get_session)
) -> list[RoutineInstance]:
    if await session.get(Routine, routine_id) is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, detail="Routine not found")
    result = await session.execute(
        select(RoutineInstance)
        .where(RoutineInstance.routine_id == routine_id)
        .order_by(RoutineInstance.scheduled_date.desc())
    )
    return list(result.scalars().all())


async def _instance_for(
    session: AsyncSession, routine_id: UUID, day: date, slot: str
) -> RoutineInstance | None:
    """The scheduled check-off row for (routine, day, slot).

    Restricted to ``ad_hoc == False`` so the idempotent checkbox upsert/delete never
    touches a separately-logged ad-hoc/PRN dose.
    """
    return await session.scalar(
        select(RoutineInstance).where(
            RoutineInstance.routine_id == routine_id,
            RoutineInstance.scheduled_date == day,
            RoutineInstance.slot == slot,
            RoutineInstance.ad_hoc.is_(False),
        )
    )


@extra.post(
    "/{routine_id}/complete",
    response_model=RoutineInstanceRead,
    status_code=status.HTTP_201_CREATED,
)
async def complete_routine(
    routine_id: UUID,
    on: date | None = None,
    slot: str = "",
    session: AsyncSession = Depends(get_session),
) -> RoutineInstance:
    """Mark a routine done for a day (+slot). Idempotent: re-check updates in place.

    ``slot`` is a medication's time-of-day; leave empty for a slotless habit.
    """
    routine = await session.get(Routine, routine_id)
    if routine is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, detail="Routine not found")
    day = on or date.today()
    instance = await _instance_for(session, routine_id, day, slot)
    if instance is None:
        instance = RoutineInstance(
            routine_id=routine_id,
            medication_id=routine.medication_id,
            scheduled_date=day,
            slot=slot,
            amount=routine.amount,  # record the prescribed dose on the intake
            unit=routine.unit,
        )
        session.add(instance)
    instance.status = "done"
    instance.completed_at = datetime.now(timezone.utc)
    await session.flush()
    await session.refresh(instance)
    await record_routine_instance(session, instance, routine)
    return instance


@extra.delete("/{routine_id}/complete", status_code=status.HTTP_204_NO_CONTENT)
async def uncomplete_routine(
    routine_id: UUID,
    on: date | None = None,
    slot: str = "",
    session: AsyncSession = Depends(get_session),
) -> None:
    """Un-check a routine for a day (+slot) — removes the completion log row."""
    day = on or date.today()
    instance = await _instance_for(session, routine_id, day, slot)
    if instance is not None:
        # Un-checking removes the log row, so the dose it produced goes too.
        await forget_for(session, "routine_instance", instance.id)
        await session.delete(instance)


router.include_router(extra)

# --- Intakes: log a taking event (may be un-prescribed, i.e. no routine) ---------
intakes = APIRouter(prefix="/intakes", tags=["routines"])


@intakes.post(
    "", response_model=RoutineInstanceRead, status_code=status.HTTP_201_CREATED
)
async def log_intake(
    payload: DoseLogCreate,
    session: AsyncSession = Depends(get_session),
) -> RoutineInstance:
    """Log an intake — always inserts a new ``ad_hoc`` event.

    ``medication_id`` is required (what was taken); ``routine_id`` is optional. When a
    routine is given it pre-fills any omitted amount/unit/medication, and links the
    intake to that prescription (for compliance). Un-prescribed intakes just carry a
    medication + amount/unit. Unlike ``/complete`` this never dedups, so it supports
    multiple intakes per day, deviations, and backdating (``completed_at`` /
    ``scheduled_date``).
    """
    routine = None
    if payload.routine_id is not None:
        routine = await session.get(Routine, payload.routine_id)
        if routine is None:
            raise HTTPException(status.HTTP_404_NOT_FOUND, detail="Routine not found")
    medication_id = payload.medication_id or (
        routine.medication_id if routine else None
    )
    if medication_id is None:
        raise HTTPException(
            status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail="medication_id is required (or a routine that names one)",
        )
    instance = RoutineInstance(
        medication_id=medication_id,
        routine_id=payload.routine_id,
        scheduled_date=payload.scheduled_date or date.today(),
        slot=payload.slot,
        status="done",
        completed_at=payload.completed_at or datetime.now(timezone.utc),
        amount=payload.amount
        if payload.amount is not None
        else (routine.amount if routine else None),
        unit=payload.unit
        if payload.unit is not None
        else (routine.unit if routine else None),
        ad_hoc=True,
        context=payload.context,
    )
    session.add(instance)
    await session.flush()
    await session.refresh(instance)
    await record_routine_instance(session, instance, routine)
    return instance


router.include_router(intakes)
