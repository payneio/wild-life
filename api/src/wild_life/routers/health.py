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
from wild_life.models.routines import Routine
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


# --- Protocol lifecycle -> medication status ---------------------------------
# "Today's rhythms" reads a medication's own ``status``, so a protocol ending
# has to ripple onto the meds it governs, or a finished course keeps showing.
# A medication can be governed by several protocols, so the ripple is careful:
# ending one protocol only ends a med when no *other* protocol still holds it.
_ENDED = {"completed", "abandoned"}
_HOLDING = {"active", "paused"}  # a protocol in these states still claims its meds


async def _governed_medication_ids(
    session: AsyncSession, protocol_id: UUID
) -> set[UUID]:
    """Medication ids the protocol prescribes (its routines' non-null med links)."""
    rows = await session.execute(
        select(Routine.medication_id).where(
            Routine.protocol_id == protocol_id,
            Routine.medication_id.is_not(None),
        )
    )
    return {mid for mid in rows.scalars().all() if mid is not None}


async def _other_governing_statuses(
    session: AsyncSession, medication_id: UUID, exclude_protocol_id: UUID
) -> list[str]:
    """Statuses of the *other* protocols that also prescribe this medication."""
    rows = await session.execute(
        select(Protocol.status)
        .join(Routine, Routine.protocol_id == Protocol.id)
        .where(
            Routine.medication_id == medication_id,
            Protocol.id != exclude_protocol_id,
        )
    )
    return list(rows.scalars().all())


async def _reconcile_protocol_medications(
    session: AsyncSession, protocol: Protocol, new_status: str
) -> None:
    """Ripple a protocol's status change onto the medications it governs.

    - ended (completed/abandoned): end each ``active`` med the protocol governs,
      unless another active/paused protocol still holds it. Meds taken
      ``as_needed`` — or already ended — are left as the user set them.
    - activated: bring governed meds that were parked (planned/completed/
      discontinued) back to ``active``; ``as_needed`` and already-active untouched.
    - planned/paused: no ripple — a med can stay active while its protocol is
      merely paused, so its own status is authoritative there.
    """
    if new_status not in _ENDED and new_status != "active":
        return
    med_ids = await _governed_medication_ids(session, protocol.id)
    today = datetime.now(UTC).date()
    for mid in med_ids:
        med = await session.get(Medication, mid)
        if med is None:
            continue
        if new_status in _ENDED:
            others = await _other_governing_statuses(session, mid, protocol.id)
            if any(s in _HOLDING for s in others):
                continue  # another protocol still needs this med
            if med.status == "active":
                med.status = (
                    "discontinued" if new_status == "abandoned" else "completed"
                )
                if med.end_date is None:
                    med.end_date = protocol.end_date or today
        elif med.status in {"planned", "completed", "discontinued"}:  # activated
            med.status = "active"
            med.end_date = None


overrides = APIRouter(tags=["health"])


@overrides.patch("/protocols/{protocol_id}", response_model=ProtocolRead)
async def update_protocol(
    protocol_id: UUID,
    payload: ProtocolUpdate,
    session: AsyncSession = Depends(get_session),
) -> Protocol:
    """Patch a protocol; a status change ripples to the meds it governs.

    Overrides the generic CRUD PATCH (registered first, so it wins the route)."""
    protocol = await session.get(Protocol, protocol_id)
    if protocol is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, detail="Not found")
    data = payload.model_dump(exclude_unset=True)
    old_status = protocol.status
    for field, value in data.items():
        setattr(protocol, field, value)
    if "status" in data and protocol.status != old_status:
        await _reconcile_protocol_medications(session, protocol, protocol.status)
    await session.flush()
    await session.refresh(protocol)
    return protocol


router.include_router(overrides)

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
