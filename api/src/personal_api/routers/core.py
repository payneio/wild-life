"""Routes for Area, Program, Project."""

from fastapi import APIRouter

from personal_api.models.core import Area, Program, Project
from personal_api.routers.crud import crud_router
from personal_api.schemas.core import (
    AreaCreate,
    AreaRead,
    AreaUpdate,
    ProgramCreate,
    ProgramRead,
    ProgramUpdate,
    ProjectCreate,
    ProjectRead,
    ProjectUpdate,
)

router = APIRouter()

router.include_router(
    crud_router(
        prefix="/areas",
        tag="areas",
        model=Area,
        create_schema=AreaCreate,
        read_schema=AreaRead,
        update_schema=AreaUpdate,
        order_by=Area.name,
    )
)
router.include_router(
    crud_router(
        prefix="/programs",
        tag="programs",
        model=Program,
        create_schema=ProgramCreate,
        read_schema=ProgramRead,
        update_schema=ProgramUpdate,
        order_by=Program.created_at.desc(),
    )
)
router.include_router(
    crud_router(
        prefix="/projects",
        tag="projects",
        model=Project,
        create_schema=ProjectCreate,
        read_schema=ProjectRead,
        update_schema=ProjectUpdate,
        order_by=Project.created_at.desc(),
    )
)
