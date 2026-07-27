"""Routes for Area, Program, Project."""

import uuid
from collections.abc import Mapping
from typing import Any

from fastapi import APIRouter, HTTPException, status

from wild_life.hierarchy import projects_in_area
from wild_life.models.core import Area, Program, Project
from wild_life.routers.crud import crud_router
from wild_life.schemas.core import (
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


def _projects_by_area(stmt: Any, params: Mapping[str, str]) -> Any:
    """``/projects?area_id=`` — resolved through the programs, not a column.

    A project's area is its program's. Without this the param would fall through
    `apply_query`, which ignores what it does not recognise, and an Area's
    Projects panel would quietly list every project in the system.
    """
    raw = params.get("area_id")
    if raw is None:
        return stmt
    try:
        area_id = uuid.UUID(raw)
    except ValueError:
        raise HTTPException(
            status.HTTP_422_UNPROCESSABLE_ENTITY, detail="area_id must be a uuid"
        ) from None
    return stmt.where(Project.id.in_(projects_in_area(area_id)))


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
        list_filter=_projects_by_area,
    )
)
