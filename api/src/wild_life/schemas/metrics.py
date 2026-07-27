"""Schemas for Metric and MetricEntry."""

import uuid
from datetime import datetime

from pydantic import BaseModel, model_validator

from wild_life.schemas.common import (
    DerivationKey,
    Entity,
    EntityType,
    MeasurementFrequency,
    MetricSource,
)


class MetricCreate(BaseModel):
    name: str
    entity_type: EntityType
    entity_id: uuid.UUID
    source: MetricSource = "manual"
    derivation: DerivationKey | None = None
    unit: str | None = None
    reference_min: float | None = None
    reference_max: float | None = None
    measurement_frequency: MeasurementFrequency | None = None
    data_source: str | None = None
    notes: str | None = None

    @model_validator(mode="after")
    def _derivation_matches_source(self) -> "MetricCreate":
        # A derived metric that names no computation reads nothing and can never
        # be corrected, because there is no entry to add. Catch it at the door.
        if self.source == "derived" and self.derivation is None:
            raise ValueError("a derived metric must name a derivation")
        if self.source == "manual" and self.derivation is not None:
            raise ValueError("a manual metric cannot have a derivation")
        return self


class MetricUpdate(BaseModel):
    name: str | None = None
    entity_type: EntityType | None = None
    entity_id: uuid.UUID | None = None
    source: MetricSource | None = None
    derivation: DerivationKey | None = None
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
    source: MetricSource
    derivation: DerivationKey | None
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


class SeriesPoint(BaseModel):
    """One reading, typed in or computed — the shape a chart actually needs."""

    recorded_at: datetime
    value: float


class DerivationInfo(BaseModel):
    key: DerivationKey
    label: str
    unit: str
    description: str
