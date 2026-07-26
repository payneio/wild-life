"""Metric — a measurable variable tracked over time — and its entries."""

import uuid
from datetime import datetime

from sqlalchemy import DateTime, Float, ForeignKey, Text
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column

from wild_life.db.base import Base
from wild_life.models.mixins import TimestampMixin, UUIDPrimaryKey


class Metric(UUIDPrimaryKey, TimestampMixin, Base):
    __tablename__ = "metrics"

    name: Mapped[str] = mapped_column(Text, nullable=False)
    area_id: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True), ForeignKey("areas.id", ondelete="SET NULL"), index=True
    )
    program_id: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True), ForeignKey("programs.id", ondelete="SET NULL"), index=True
    )
    condition_id: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True), ForeignKey("conditions.id", ondelete="SET NULL"), index=True
    )  # a lab/vital belongs to a health condition
    unit: Mapped[str | None] = mapped_column(Text)
    # The *externally defined* normal band — a lab's reference range, a clinical
    # guideline. Context to draw behind the trend, never a target: what I'm aiming
    # for is a claim, and claims live on Outcome.
    reference_min: Mapped[float | None] = mapped_column(Float)
    reference_max: Mapped[float | None] = mapped_column(Float)
    measurement_frequency: Mapped[str | None] = mapped_column(
        Text
    )  # MeasurementFrequency; drives the review dashboard's overdue check
    data_source: Mapped[str | None] = mapped_column(Text)
    notes: Mapped[str | None] = mapped_column(Text)


class MetricEntry(UUIDPrimaryKey, TimestampMixin, Base):
    __tablename__ = "metric_entries"

    metric_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("metrics.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    # A reading happens at a moment, not on a day — some metrics are read several
    # times daily, and the time is what tells those entries apart.
    recorded_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False, index=True
    )
    value: Mapped[float] = mapped_column(Float, nullable=False)
    notes: Mapped[str | None] = mapped_column(Text)
