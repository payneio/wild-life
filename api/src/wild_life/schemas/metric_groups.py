"""Schemas for MetricGroup, its members, and the readings it produces."""

import uuid
from datetime import datetime

from pydantic import BaseModel

from wild_life.schemas.common import Entity, EntityType


class MetricGroupCreate(BaseModel):
    name: str
    entity_type: EntityType
    entity_id: uuid.UUID
    description: str | None = None


class MetricGroupUpdate(BaseModel):
    name: str | None = None
    entity_type: EntityType | None = None
    entity_id: uuid.UUID | None = None
    description: str | None = None


class MetricGroupRead(Entity):
    name: str
    entity_type: EntityType
    entity_id: uuid.UUID
    description: str | None


class GroupMemberCreate(BaseModel):
    group_id: uuid.UUID
    metric_id: uuid.UUID
    position: int = 0


class GroupMemberUpdate(BaseModel):
    position: int | None = None


class GroupMemberRead(Entity):
    group_id: uuid.UUID
    metric_id: uuid.UUID
    position: int


class MemberOrder(BaseModel):
    """The whole ordered membership, rewritten in one call.

    Anchors would be over-engineering here: a group is ten rows with one writer,
    so the client can send the list it just dragged into shape and the server
    renumbers. `ranking.py`'s fractional indexing exists for the opposite case.
    """

    metric_ids: list[uuid.UUID]


class ReadingValue(BaseModel):
    metric_id: uuid.UUID
    value: float


class GroupReadingCreate(BaseModel):
    """One act of measuring, with everything it produced.

    The values ride along rather than being posted one at a time, because they
    share a moment and a context and a half-written draw is not a state worth
    being able to reach.
    """

    recorded_at: datetime
    context: str | None = None
    values: list[ReadingValue] = []


class GroupReadingUpdate(BaseModel):
    recorded_at: datetime | None = None
    context: str | None = None


class ReadingEntry(BaseModel):
    """One value inside a reading, flattened for the table view."""

    metric_id: uuid.UUID
    value: float


class GroupReadingRead(Entity):
    group_id: uuid.UUID
    recorded_at: datetime
    context: str | None
    # Batch-loaded, not lazy: the table renders every reading at once and an
    # N+1 here would be one query per draw.
    entries: list[ReadingEntry] = []
