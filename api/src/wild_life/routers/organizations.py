"""Routes for organizations and person<->organization affiliations."""

from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from wild_life.db.session import get_session
from wild_life.models.organizations import Affiliation, Organization
from wild_life.models.people import Person
from wild_life.routers.crud import crud_router
from wild_life.schemas.organizations import (
    AffiliationCreate,
    AffiliationRead,
    AffiliationUpdate,
    OrganizationCreate,
    OrganizationRead,
    OrganizationUpdate,
)

router = APIRouter()

router.include_router(
    crud_router(
        prefix="/organizations",
        tag="organizations",
        model=Organization,
        create_schema=OrganizationCreate,
        read_schema=OrganizationRead,
        update_schema=OrganizationUpdate,
        order_by=Organization.name,
    )
)

router.include_router(
    crud_router(
        prefix="/affiliations",
        tag="organizations",
        model=Affiliation,
        create_schema=AffiliationCreate,
        read_schema=AffiliationRead,
        update_schema=AffiliationUpdate,
        order_by=Affiliation.is_primary.desc(),
    )
)

nested = APIRouter(tags=["organizations"])


@nested.get("/people/{person_id}/affiliations", response_model=list[AffiliationRead])
async def list_person_affiliations(
    person_id: UUID, session: AsyncSession = Depends(get_session)
) -> list[Affiliation]:
    """The organizations a person is affiliated with (primary first)."""
    person = await session.get(Person, person_id)
    if person is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, detail="Person not found")
    result = await session.execute(
        select(Affiliation)
        .where(Affiliation.person_id == person_id)
        .order_by(Affiliation.is_primary.desc(), Affiliation.start_date.desc())
    )
    return list(result.scalars().all())


@nested.get(
    "/organizations/{organization_id}/affiliations",
    response_model=list[AffiliationRead],
)
async def list_organization_affiliations(
    organization_id: UUID, session: AsyncSession = Depends(get_session)
) -> list[Affiliation]:
    """The people affiliated with an organization."""
    org = await session.get(Organization, organization_id)
    if org is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, detail="Organization not found")
    result = await session.execute(
        select(Affiliation)
        .where(Affiliation.organization_id == organization_id)
        .order_by(Affiliation.is_primary.desc(), Affiliation.start_date.desc())
    )
    return list(result.scalars().all())


router.include_router(nested)
