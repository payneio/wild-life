"""Routes for the health domain: conditions, medications, protocols (+items),
health events, insurance plans, allergies."""

from datetime import UTC
from datetime import date as date_
from datetime import datetime
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from wild_life.db.session import get_session
from wild_life.regimen import compute_regimen
from wild_life.models.health import (
    Allergy,
    Condition,
    InsurancePlan,
    Medication,
    Protocol,
)
from wild_life.routers.crud import crud_router
from wild_life.schemas.health import (
    AllergyCreate,
    AllergyRead,
    AllergyUpdate,
    ConditionCreate,
    ConditionRead,
    ConditionUpdate,
    InsurancePlanCreate,
    InsurancePlanRead,
    InsurancePlanUpdate,
    MedicationCreate,
    MedicationRead,
    MedicationUpdate,
    ProtocolCreate,
    ProtocolRead,
    ProtocolUpdate,
    RegimenEntry,
)

router = APIRouter()


# Protocol liveness is derived (not paused + in-window), so a protocol ending needs
# no ripple onto medications — the regimen simply stops surfacing its steps. The old
# `_reconcile_protocol_medications` sync subsystem is gone.

router.include_router(
    crud_router(
        prefix="/conditions",
        tag="health",
        model=Condition,
        create_schema=ConditionCreate,
        read_schema=ConditionRead,
        update_schema=ConditionUpdate,
        order_by=Condition.name,
    )
)
router.include_router(
    crud_router(
        prefix="/medications",
        tag="health",
        model=Medication,
        create_schema=MedicationCreate,
        read_schema=MedicationRead,
        update_schema=MedicationUpdate,
        order_by=Medication.name,
    )
)
router.include_router(
    crud_router(
        prefix="/protocols",
        tag="health",
        model=Protocol,
        create_schema=ProtocolCreate,
        read_schema=ProtocolRead,
        update_schema=ProtocolUpdate,
        order_by=Protocol.name,
    )
)
router.include_router(
    crud_router(
        prefix="/insurance-plans",
        tag="health",
        model=InsurancePlan,
        create_schema=InsurancePlanCreate,
        read_schema=InsurancePlanRead,
        update_schema=InsurancePlanUpdate,
        order_by=InsurancePlan.name,
    )
)
router.include_router(
    crud_router(
        prefix="/allergies",
        tag="health",
        model=Allergy,
        create_schema=AllergyCreate,
        read_schema=AllergyRead,
        update_schema=AllergyUpdate,
        order_by=Allergy.substance,
    )
)

nested = APIRouter(tags=["health"])


@nested.get("/regimen", response_model=list[RegimenEntry])
async def get_regimen(
    date: date_ | None = None, session: AsyncSession = Depends(get_session)
) -> list[RegimenEntry]:
    """The routines due on ``date`` (defaults to today, UTC).

    Derived from the active Routines — the single source of truth — so a
    completed/paused protocol's routines fall off without any extra syncing.
    """
    day = date or datetime.now(UTC).date()
    return await compute_regimen(session, day)


@nested.get(
    "/conditions/{condition_id}/medications", response_model=list[MedicationRead]
)
async def list_condition_medications(
    condition_id: UUID, session: AsyncSession = Depends(get_session)
) -> list[Medication]:
    """Medications treating a condition."""
    condition = await session.get(Condition, condition_id)
    if condition is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, detail="Condition not found")
    result = await session.execute(
        select(Medication)
        .where(Medication.condition_id == condition_id)
        .order_by(Medication.name)
    )
    return list(result.scalars().all())


router.include_router(nested)
