"""Metric — a measurable variable tracked over time — and its entries."""

import uuid
from datetime import date

from sqlalchemy import Date, Float, ForeignKey, Text
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column

from personal_api.db.base import Base
from personal_api.models.mixins import TimestampMixin, UUIDPrimaryKey


class Metric(UUIDPrimaryKey, TimestampMixin, Base):
    __tablename__ = "metrics"

    name: Mapped[str] = mapped_column(Text, nullable=False)
    area_id: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True), ForeignKey("areas.id", ondelete="SET NULL"), index=True
    )
    program_id: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True), ForeignKey("programs.id", ondelete="SET NULL"), index=True
    )
    unit: Mapped[str | None] = mapped_column(Text)
    target_value: Mapped[float | None] = mapped_column(Float)
    target_min: Mapped[float | None] = mapped_column(Float)
    target_max: Mapped[float | None] = mapped_column(Float)
    measurement_frequency: Mapped[str | None] = mapped_column(Text)
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
    entry_date: Mapped[date] = mapped_column(Date, nullable=False, index=True)
    value: Mapped[float] = mapped_column(Float, nullable=False)
    notes: Mapped[str | None] = mapped_column(Text)
