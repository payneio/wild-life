"""Schemas for Tag and entity-tag attachments."""

import uuid

from pydantic import BaseModel

from personal_api.schemas.common import Entity, EntityType


class TagCreate(BaseModel):
    name: str
    color: str | None = None


class TagUpdate(BaseModel):
    name: str | None = None
    color: str | None = None


class TagRead(Entity):
    name: str
    color: str | None


class EntityTagCreate(BaseModel):
    entity_type: EntityType
    entity_id: uuid.UUID


class EntityTagRead(BaseModel):
    tag_id: uuid.UUID
    entity_type: str
    entity_id: uuid.UUID

    model_config = {"from_attributes": True}
