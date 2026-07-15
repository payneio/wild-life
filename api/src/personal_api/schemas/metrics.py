"""Schemas for Metric and MetricEntry."""

import uuid
from datetime import date

from pydantic import BaseModel

from personal_api.schemas.common import Entity


class MetricCreate(BaseModel):
    name: str
    area_id: uuid.UUID | None = None
    program_id: uuid.UUID | None = None
    unit: str | None = None
    target_value: float | None = None
    target_min: float | None = None
    target_max: float | None = None
    measurement_frequency: str | None = None
    data_source: str | None = None
    notes: str | None = None


class MetricUpdate(BaseModel):
    name: str | None = None
    area_id: uuid.UUID | None = None
    program_id: uuid.UUID | None = None
    unit: str | None = None
    target_value: float | None = None
    target_min: float | None = None
    target_max: float | None = None
    measurement_frequency: str | None = None
    data_source: str | None = None
    notes: str | None = None


class MetricRead(Entity):
    name: str
    area_id: uuid.UUID | None
    program_id: uuid.UUID | None
    unit: str | None
    target_value: float | None
    target_min: float | None
    target_max: float | None
    measurement_frequency: str | None
    data_source: str | None
    notes: str | None


class MetricEntryCreate(BaseModel):
    metric_id: uuid.UUID
    entry_date: date
    value: float
    notes: str | None = None


class MetricEntryUpdate(BaseModel):
    entry_date: date | None = None
    value: float | None = None
    notes: str | None = None


class MetricEntryRead(Entity):
    metric_id: uuid.UUID
    entry_date: date
    value: float
    notes: str | None
