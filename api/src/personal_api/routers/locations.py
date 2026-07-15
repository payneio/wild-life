"""Routes for locations."""

from fastapi import APIRouter

from personal_api.models.locations import Location
from personal_api.routers.crud import crud_router
from personal_api.schemas.locations import (
    LocationCreate,
    LocationRead,
    LocationUpdate,
)

router = APIRouter()

router.include_router(
    crud_router(
        prefix="/locations",
        tag="locations",
        model=Location,
        create_schema=LocationCreate,
        read_schema=LocationRead,
        update_schema=LocationUpdate,
        order_by=Location.name,
    )
)
