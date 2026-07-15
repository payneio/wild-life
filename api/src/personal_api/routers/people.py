"""Routes for people + interactions."""

from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from personal_api.db.session import get_session
from personal_api.models.people import Interaction, Person
from personal_api.routers.crud import crud_router
from personal_api.schemas.people import (
    InteractionCreate,
    InteractionRead,
    InteractionUpdate,
    PersonCreate,
    PersonRead,
    PersonUpdate,
)

router = APIRouter()

router.include_router(
    crud_router(
        prefix="/people",
        tag="people",
        model=Person,
        create_schema=PersonCreate,
        read_schema=PersonRead,
        update_schema=PersonUpdate,
        order_by=Person.name,
    )
)
router.include_router(
    crud_router(
        prefix="/interactions",
        tag="people",
        model=Interaction,
        create_schema=InteractionCreate,
        read_schema=InteractionRead,
        update_schema=InteractionUpdate,
        order_by=Interaction.occurred_at.desc(),
    )
)

nested = APIRouter(prefix="/people", tags=["people"])


@nested.get("/{person_id}/interactions", response_model=list[InteractionRead])
async def list_person_interactions(
    person_id: UUID, session: AsyncSession = Depends(get_session)
) -> list[Interaction]:
    person = await session.get(Person, person_id)
    if person is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, detail="Person not found")
    result = await session.execute(
        select(Interaction)
        .where(Interaction.person_id == person_id)
        .order_by(Interaction.occurred_at.desc())
    )
    return list(result.scalars().all())


router.include_router(nested)
