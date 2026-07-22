"""Routes for tags + attaching tags to any entity."""

from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from wild_life.db.session import get_session
from wild_life.models.tags import EntityTag, Tag
from wild_life.routers.crud import crud_router
from wild_life.schemas.common import EntityType
from wild_life.schemas.tags import (
    EntityTagCreate,
    EntityTagRead,
    TagCreate,
    TagRead,
    TagUpdate,
)

router = APIRouter()

router.include_router(
    crud_router(
        prefix="/tags",
        tag="tags",
        model=Tag,
        create_schema=TagCreate,
        read_schema=TagRead,
        update_schema=TagUpdate,
        order_by=Tag.name,
    )
)

attach = APIRouter(prefix="/tags", tags=["tags"])


@attach.post("/{tag_id}/attach", response_model=EntityTagRead, status_code=201)
async def attach_tag(
    tag_id: UUID,
    payload: EntityTagCreate,
    session: AsyncSession = Depends(get_session),
) -> EntityTag:
    if await session.get(Tag, tag_id) is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, detail="Tag not found")
    key = {
        "tag_id": tag_id,
        "entity_type": payload.entity_type,
        "entity_id": payload.entity_id,
    }
    existing = await session.get(EntityTag, key)
    if existing is not None:
        return existing
    link = EntityTag(tag_id=tag_id, **payload.model_dump())
    session.add(link)
    await session.flush()
    return link


@attach.delete("/{tag_id}/attach", status_code=status.HTTP_204_NO_CONTENT)
async def detach_tag(
    tag_id: UUID,
    entity_type: EntityType,
    entity_id: UUID,
    session: AsyncSession = Depends(get_session),
) -> None:
    link = await session.get(
        EntityTag,
        {"tag_id": tag_id, "entity_type": entity_type, "entity_id": entity_id},
    )
    if link is not None:
        await session.delete(link)


@attach.get("/{tag_id}/entities", response_model=list[EntityTagRead])
async def list_tag_entities(
    tag_id: UUID, session: AsyncSession = Depends(get_session)
) -> list[EntityTag]:
    result = await session.execute(select(EntityTag).where(EntityTag.tag_id == tag_id))
    return list(result.scalars().all())


router.include_router(attach)

# Reverse lookup: which tags are on a given entity.
entity_tags = APIRouter(prefix="/entity-tags", tags=["tags"])


@entity_tags.get("", response_model=list[TagRead])
async def tags_for_entity(
    entity_type: EntityType,
    entity_id: UUID,
    session: AsyncSession = Depends(get_session),
) -> list[Tag]:
    result = await session.execute(
        select(Tag)
        .join(EntityTag, EntityTag.tag_id == Tag.id)
        .where(EntityTag.entity_type == entity_type, EntityTag.entity_id == entity_id)
        .order_by(Tag.name)
    )
    return list(result.scalars().all())


router.include_router(entity_tags)
