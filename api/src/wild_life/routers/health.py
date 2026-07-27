"""Routes for the health domain: medications, insurance plans, allergies.

Conditions are not here: a condition is a Program in the Health area, so its
routes are the ordinary `/programs` ones. Protocols aren't either — grouped
routines aimed at an outcome belong to any program, not just a clinical one.
"""

from datetime import UTC
from datetime import date as date_
from datetime import datetime

from fastapi import APIRouter, Depends
from sqlalchemy.ext.asyncio import AsyncSession

from wild_life.db.session import get_session
from wild_life.regimen import compute_regimen
from wild_life.models.health import (
    Allergy,
    InsurancePlan,
    Medication,
)
from wild_life.routers.crud import crud_router
from wild_life.schemas.health import (
    AllergyCreate,
    AllergyRead,
    AllergyUpdate,
    InsurancePlanCreate,
    InsurancePlanRead,
    InsurancePlanUpdate,
    MedicationCreate,
    MedicationRead,
    MedicationUpdate,
    RegimenEntry,
)

router = APIRouter()


# Protocol liveness is derived (not paused + in-window), so a protocol ending needs
# no ripple onto medications — the regimen simply stops surfacing its steps. The old
# `_reconcile_protocol_medications` sync subsystem is gone.

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


router.include_router(nested)
