"""Routes for Resource and Decision."""

from fastapi import APIRouter

from wild_life.models.knowledge import Decision, Resource
from wild_life.routers.crud import crud_router
from wild_life.spine import record_finish
from wild_life.schemas.knowledge import (
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
        on_write=lambda s, o: record_finish(s, "decision", o),
        spine_entity="decision",
        order_by=Decision.created_at.desc(),
    )
)
