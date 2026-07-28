"""Schemas for Note."""

import uuid
from datetime import date

from pydantic import BaseModel

from wild_life.schemas.common import Entity, EntityType


class EntityRef(BaseModel):
    """A link from a note to another entity (soft-polymorphic target)."""

    target_type: EntityType
    target_id: uuid.UUID


class TagRef(BaseModel):
    """A tag on a note, projected into the read model.

    Read-only: tags are `EntityTag` rows and are written through `/tags/attach`.
    They ride along here for the same reason `links` does — a log renders
    hundreds of notes at once, and a per-row lookup would be hundreds of queries.
    """

    id: uuid.UUID
    name: str
    color: str | None = None


class NoteCreate(BaseModel):
    title: str | None = None
    body: str = ""
    entry_date: date | None = None
    mood: str | None = None
    entity_type: EntityType | None = None
    entity_id: uuid.UUID | None = None
    links: list[EntityRef] = []


class NoteUpdate(BaseModel):
    title: str | None = None
    body: str | None = None
    entry_date: date | None = None
    mood: str | None = None
    entity_type: EntityType | None = None
    entity_id: uuid.UUID | None = None
    links: list[EntityRef] | None = None


class NoteRead(Entity):
    title: str | None
    body: str
    entry_date: date | None
    mood: str | None
    entity_type: EntityType | None
    entity_id: uuid.UUID | None
    links: list[EntityRef] = []
    tags: list[TagRef] = []


class NoteImageRead(Entity):
    note_id: uuid.UUID
    filename: str | None
    content_type: str | None
    sort_order: int
