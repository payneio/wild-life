"""Routes for routines + their completable instances."""

from datetime import date, datetime, timezone
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from personal_api.db.session import get_session
from personal_api.models.routines import Routine, RoutineInstance
from personal_api.routers.crud import crud_router
from personal_api.schemas.routines import (
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


@extra.post(
    "/{routine_id}/complete",
    response_model=RoutineInstanceRead,
    status_code=status.HTTP_201_CREATED,
)
async def complete_routine(
    routine_id: UUID,
    on: date | None = None,
    session: AsyncSession = Depends(get_session),
) -> RoutineInstance:
    """Log a completion for a routine (defaults to today). Preserves history."""
    if await session.get(Routine, routine_id) is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, detail="Routine not found")
    instance = RoutineInstance(
        routine_id=routine_id,
        scheduled_date=on or date.today(),
        status="done",
        completed_at=datetime.now(timezone.utc),
    )
    session.add(instance)
    await session.flush()
    await session.refresh(instance)
    return instance


router.include_router(extra)
