"""Routes for routines + their completable instances."""

from datetime import date, datetime, timezone
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from wild_life.db.session import get_session
from wild_life.models.routines import Routine, RoutineInstance
from wild_life.routers.crud import crud_router
from wild_life.schemas.routines import (
    RoutineCreate,
    RoutineInstanceCreate,
    RoutineInstanceRead,
    RoutineInstanceUpdate,
    RoutineRead,
    RoutineUpdate,
)

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
    return await session.scalar(
        select(RoutineInstance).where(
            RoutineInstance.routine_id == routine_id,
            RoutineInstance.scheduled_date == day,
            RoutineInstance.slot == slot,
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
    if await session.get(Routine, routine_id) is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, detail="Routine not found")
    day = on or date.today()
    instance = await _instance_for(session, routine_id, day, slot)
    if instance is None:
        instance = RoutineInstance(routine_id=routine_id, scheduled_date=day, slot=slot)
        session.add(instance)
    instance.status = "done"
    instance.completed_at = datetime.now(timezone.utc)
    await session.flush()
    await session.refresh(instance)
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
        await session.delete(instance)


router.include_router(extra)
