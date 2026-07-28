"""Schemas for Metric and MetricEntry."""

import uuid
from datetime import datetime

from pydantic import BaseModel, model_validator

from wild_life.schemas.common import (
    TWO_OPERAND_DERIVATIONS,
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
    scale: str | None = None
    numerator_metric_id: uuid.UUID | None = None
    denominator_metric_id: uuid.UUID | None = None

    @model_validator(mode="after")
    def _derivation_matches_source(self) -> "MetricCreate":
        # A derived metric that names no computation reads nothing and can never
        # be corrected, because there is no entry to add. Catch it at the door.
        if self.source == "derived" and self.derivation is None:
            raise ValueError("a derived metric must name a derivation")
        if self.source == "manual" and self.derivation is not None:
            raise ValueError("a manual metric cannot have a derivation")
        # Same argument one level down: a ratio missing an operand computes
        # nothing, and an operand on a computation that ignores it is a lie about
        # where the number comes from.
        needs_operands = self.derivation in TWO_OPERAND_DERIVATIONS
        has_operands = (
            self.numerator_metric_id is not None
            and self.denominator_metric_id is not None
        )
        if needs_operands and not has_operands:
            raise ValueError(
                f"a {self.derivation} metric must name both a numerator and a denominator"
            )
        if not needs_operands and (
            self.numerator_metric_id is not None
            or self.denominator_metric_id is not None
        ):
            raise ValueError("only ratio/percent metrics take operands")
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
    scale: str | None = None
    numerator_metric_id: uuid.UUID | None = None
    denominator_metric_id: uuid.UUID | None = None


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
    scale: str | None
    numerator_metric_id: uuid.UUID | None
    denominator_metric_id: uuid.UUID | None


class MetricEntryCreate(BaseModel):
    metric_id: uuid.UUID
    recorded_at: datetime
    value: float
    context: str | None = None


class MetricEntryUpdate(BaseModel):
    recorded_at: datetime | None = None
    value: float | None = None
    context: str | None = None


class MetricEntryRead(Entity):
    metric_id: uuid.UUID
    recorded_at: datetime
    value: float
    context: str | None


class SeriesPoint(BaseModel):
    """One reading, typed in or computed — the shape a chart actually needs."""

    recorded_at: datetime
    value: float


class DerivationInfo(BaseModel):
    key: DerivationKey
    label: str
    unit: str
    description: str
