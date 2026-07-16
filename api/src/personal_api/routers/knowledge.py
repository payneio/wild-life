"""Routes for Resource and Decision."""

from fastapi import APIRouter

from personal_api.models.knowledge import Decision, Resource
from personal_api.routers.crud import crud_router
from personal_api.schemas.knowledge import (
    DecisionCreate,
    DecisionRead,
    DecisionUpdate,
    ResourceCreate,
    ResourceRead,
    ResourceUpdate,
)

router = APIRouter()

router.include_router(
    crud_router(
        prefix="/resources",
        tag="resources",
        model=Resource,
        create_schema=ResourceCreate,
        read_schema=ResourceRead,
        update_schema=ResourceUpdate,
        order_by=Resource.title,
    )
)
router.include_router(
    crud_router(
        prefix="/decisions",
        tag="decisions",
        model=Decision,
        create_schema=DecisionCreate,
        read_schema=DecisionRead,
        update_schema=DecisionUpdate,
        order_by=Decision.created_at.desc(),
    )
)
