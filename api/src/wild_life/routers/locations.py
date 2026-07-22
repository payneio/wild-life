"""Routes for locations."""

from fastapi import APIRouter

from wild_life.models.locations import Location
from wild_life.routers.crud import crud_router
from wild_life.schemas.locations import (
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
