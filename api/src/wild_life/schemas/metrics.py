"""Schemas for Metric and MetricEntry."""

import uuid
from datetime import datetime

from pydantic import BaseModel

from wild_life.schemas.common import Entity, EntityType, MeasurementFrequency


class MetricCreate(BaseModel):
    name: str
    entity_type: EntityType
    entity_id: uuid.UUID
    unit: str | None = None
    reference_min: float | None = None
    reference_max: float | None = None
    measurement_frequency: MeasurementFrequency | None = None
    data_source: str | None = None
    notes: str | None = None


class MetricUpdate(BaseModel):
    name: str | None = None
    entity_type: EntityType | None = None
    entity_id: uuid.UUID | None = None
    unit: str | None = None
    reference_min: float | None = None
    reference_max: float | None = None
    measurement_frequency: MeasurementFrequency | None = None
    data_source: str | None = None
    notes: str | None = None


class MetricRead(Entity):
    name: str
    entity_type: EntityType
    entity_id: uuid.UUID
    unit: str | None
    reference_min: float | None
    reference_max: float | None
    measurement_frequency: MeasurementFrequency | None
    data_source: str | None
    notes: str | None


class MetricEntryCreate(BaseModel):
    metric_id: uuid.UUID
    recorded_at: datetime
    value: float
    notes: str | None = None


class MetricEntryUpdate(BaseModel):
    recorded_at: datetime | None = None
    value: float | None = None
    notes: str | None = None


class MetricEntryRead(Entity):
    metric_id: uuid.UUID
    recorded_at: datetime
    value: float
    notes: str | None
