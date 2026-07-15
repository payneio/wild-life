"""Routes for the health domain: conditions, medications, protocols (+items),
health events, insurance plans, allergies."""

from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from personal_api.db.session import get_session
from personal_api.models.health import (
    Allergy,
    Condition,
    HealthEvent,
    InsurancePlan,
    Medication,
    Protocol,
    ProtocolItem,
)
from personal_api.routers.crud import crud_router
from personal_api.schemas.health import (
    AllergyCreate,
    AllergyRead,
    AllergyUpdate,
    ConditionCreate,
    ConditionRead,
    ConditionUpdate,
    HealthEventCreate,
    HealthEventRead,
    HealthEventUpdate,
    InsurancePlanCreate,
    InsurancePlanRead,
    InsurancePlanUpdate,
    MedicationCreate,
    MedicationRead,
    MedicationUpdate,
    ProtocolCreate,
    ProtocolItemCreate,
    ProtocolItemRead,
    ProtocolItemUpdate,
    ProtocolRead,
    ProtocolUpdate,
)

router = APIRouter()

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
        prefix="/protocol-items",
        tag="health",
        model=ProtocolItem,
        create_schema=ProtocolItemCreate,
        read_schema=ProtocolItemRead,
        update_schema=ProtocolItemUpdate,
        order_by=ProtocolItem.sort_order,
    )
)
router.include_router(
    crud_router(
        prefix="/health-events",
        tag="health",
        model=HealthEvent,
        create_schema=HealthEventCreate,
        read_schema=HealthEventRead,
        update_schema=HealthEventUpdate,
        order_by=HealthEvent.occurred_on.desc(),
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


@nested.get("/protocols/{protocol_id}/items", response_model=list[ProtocolItemRead])
async def list_protocol_items(
    protocol_id: UUID, session: AsyncSession = Depends(get_session)
) -> list[ProtocolItem]:
    """The ordered steps of a protocol."""
    protocol = await session.get(Protocol, protocol_id)
    if protocol is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, detail="Protocol not found")
    result = await session.execute(
        select(ProtocolItem)
        .where(ProtocolItem.protocol_id == protocol_id)
        .order_by(ProtocolItem.sort_order, ProtocolItem.created_at)
    )
    return list(result.scalars().all())


@nested.get("/conditions/{condition_id}/medications", response_model=list[MedicationRead])
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


@nested.get("/conditions/{condition_id}/events", response_model=list[HealthEventRead])
async def list_condition_events(
    condition_id: UUID, session: AsyncSession = Depends(get_session)
) -> list[HealthEvent]:
    """Clinical events linked to a condition (most recent first)."""
    condition = await session.get(Condition, condition_id)
    if condition is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, detail="Condition not found")
    result = await session.execute(
        select(HealthEvent)
        .where(HealthEvent.condition_id == condition_id)
        .order_by(HealthEvent.occurred_on.desc())
    )
    return list(result.scalars().all())


router.include_router(nested)
