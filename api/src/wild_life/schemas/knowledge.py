"""Schemas for Resource and Decision."""

import uuid
from datetime import date

from pydantic import BaseModel

from wild_life.schemas.common import Entity, EntityType


class ResourceCreate(BaseModel):
    title: str
    resource_type: str | None = None
    url: str | None = None
    description: str | None = None
    entity_type: EntityType | None = None
    entity_id: uuid.UUID | None = None


class ResourceUpdate(BaseModel):
    title: str | None = None
    resource_type: str | None = None
    url: str | None = None
    description: str | None = None
    entity_type: EntityType | None = None
    entity_id: uuid.UUID | None = None


class ResourceRead(Entity):
    title: str
    resource_type: str | None
    url: str | None
    description: str | None
    entity_type: EntityType | None
    entity_id: uuid.UUID | None


class DecisionCreate(BaseModel):
    question: str
    options_considered: str | None = None
    decision: str | None = None
    rationale: str | None = None
    assumptions: str | None = None
    owner_id: uuid.UUID | None = None
    decided_on: date | None = None
    review_date: date | None = None
    entity_type: EntityType | None = None
    entity_id: uuid.UUID | None = None


class DecisionUpdate(BaseModel):
    question: str | None = None
    options_considered: str | None = None
    decision: str | None = None
    rationale: str | None = None
    assumptions: str | None = None
    owner_id: uuid.UUID | None = None
    decided_on: date | None = None
    review_date: date | None = None
    entity_type: EntityType | None = None
    entity_id: uuid.UUID | None = None


class DecisionRead(Entity):
    question: str
    options_considered: str | None
    decision: str | None
    rationale: str | None
    assumptions: str | None
    owner_id: uuid.UUID | None
    decided_on: date | None
    review_date: date | None
    entity_type: EntityType | None
    entity_id: uuid.UUID | None
