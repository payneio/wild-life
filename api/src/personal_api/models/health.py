"""Health domain: conditions, medications, protocols, encounters, insurance, allergies.

Providers are ordinary ``Person`` records (with a ``specialty``) linked to their
clinic via ``Affiliation``; clinics/pharmacies/insurers are ``Organization``s;
numeric labs/vitals ride the existing ``Metric``/``MetricEntry``. The tables here
capture what those don't: what you take, the regimens you take it under, the
conditions it treats, and the dated clinical record.
"""

import uuid
from datetime import date

from sqlalchemy import Date, ForeignKey, Integer, Text
from sqlalchemy.dialects.postgresql import ARRAY, JSONB, UUID
from sqlalchemy.orm import Mapped, mapped_column

from personal_api.db.base import Base
from personal_api.models.mixins import TimestampMixin, UUIDPrimaryKey


def _people_fk(index: bool = False) -> Mapped[uuid.UUID | None]:
    return mapped_column(
        UUID(as_uuid=True), ForeignKey("people.id", ondelete="SET NULL"), index=index
    )


def _org_fk() -> Mapped[uuid.UUID | None]:
    return mapped_column(
        UUID(as_uuid=True),
        ForeignKey("organizations.id", ondelete="SET NULL"),
        index=True,
    )


def _condition_fk() -> Mapped[uuid.UUID | None]:
    return mapped_column(
        UUID(as_uuid=True),
        ForeignKey("conditions.id", ondelete="SET NULL"),
        index=True,
    )


def _area_fk() -> Mapped[uuid.UUID | None]:
    return mapped_column(
        UUID(as_uuid=True), ForeignKey("areas.id", ondelete="SET NULL"), index=True
    )


def _program_fk() -> Mapped[uuid.UUID | None]:
    return mapped_column(
        UUID(as_uuid=True), ForeignKey("programs.id", ondelete="SET NULL"), index=True
    )


class Condition(UUIDPrimaryKey, TimestampMixin, Base):
    """A health condition or diagnosis that medications and events organize around."""

    __tablename__ = "conditions"

    name: Mapped[str] = mapped_column(Text, nullable=False)
    category: Mapped[str | None] = mapped_column(
        Text
    )  # gastrointestinal/cardiovascular/dermatologic/musculoskeletal/urologic/auditory/mental_health/other
    status: Mapped[str] = mapped_column(
        Text, server_default="active", nullable=False
    )  # active/monitoring/chronic/resolved/ruled_out
    area_id: Mapped[uuid.UUID | None] = _area_fk()
    program_id: Mapped[uuid.UUID | None] = _program_fk()
    severity: Mapped[str | None] = mapped_column(Text)
    onset_date: Mapped[date | None] = mapped_column(Date)
    resolved_date: Mapped[date | None] = mapped_column(Date)
    diagnosed_by_id: Mapped[uuid.UUID | None] = _people_fk()
    description: Mapped[str | None] = mapped_column(Text)
    notes: Mapped[str | None] = mapped_column(Text)


class Medication(UUIDPrimaryKey, TimestampMixin, Base):
    """A drug or supplement regimen — what you take, how much, when, and why."""

    __tablename__ = "medications"

    name: Mapped[str] = mapped_column(Text, nullable=False)
    brand: Mapped[str | None] = mapped_column(Text)  # e.g. Lipitor
    generic_name: Mapped[str | None] = mapped_column(Text)  # e.g. atorvastatin
    med_type: Mapped[str] = mapped_column(
        Text, server_default="supplement", nullable=False
    )  # prescription/otc/supplement
    form: Mapped[str | None] = mapped_column(Text)  # tablet/capsule/liquid/powder
    strength: Mapped[str | None] = mapped_column(Text)  # e.g. "40mg"
    dose: Mapped[str | None] = mapped_column(Text)  # e.g. "1 tablet"
    # Dosing schedule: list of {"slot": "breakfast", "amount": "1"}.
    schedule: Mapped[list[dict]] = mapped_column(
        JSONB, server_default="[]", nullable=False
    )
    reason: Mapped[str | None] = mapped_column(Text)
    condition_id: Mapped[uuid.UUID | None] = _condition_fk()
    prescriber_id: Mapped[uuid.UUID | None] = _people_fk()
    pharmacy_id: Mapped[uuid.UUID | None] = _org_fk()
    status: Mapped[str] = mapped_column(
        Text, server_default="active", nullable=False
    )  # active/discontinued/as_needed/planned/completed
    start_date: Mapped[date | None] = mapped_column(Date)
    end_date: Mapped[date | None] = mapped_column(Date)
    instructions: Mapped[str | None] = mapped_column(Text)
    notes: Mapped[str | None] = mapped_column(Text)


class Protocol(UUIDPrimaryKey, TimestampMixin, Base):
    """A named, time-boxed treatment regimen bundling dosed steps (ProtocolItems)."""

    __tablename__ = "protocols"

    name: Mapped[str] = mapped_column(Text, nullable=False)
    category: Mapped[str | None] = mapped_column(Text)
    intended_outcome: Mapped[str | None] = mapped_column(Text)
    status: Mapped[str] = mapped_column(
        Text, server_default="planned", nullable=False
    )  # planned/active/paused/completed/abandoned
    area_id: Mapped[uuid.UUID | None] = _area_fk()
    program_id: Mapped[uuid.UUID | None] = _program_fk()
    start_date: Mapped[date | None] = mapped_column(Date)
    end_date: Mapped[date | None] = mapped_column(Date)
    duration: Mapped[str | None] = mapped_column(Text)  # e.g. "4-6 wk"
    condition_id: Mapped[uuid.UUID | None] = _condition_fk()
    provider_id: Mapped[uuid.UUID | None] = _people_fk()
    notes: Mapped[str | None] = mapped_column(Text)


class ProtocolItem(UUIDPrimaryKey, TimestampMixin, Base):
    """One dosed step within a protocol; optionally links to a Medication record."""

    __tablename__ = "protocol_items"

    protocol_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("protocols.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    medication_id: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True), ForeignKey("medications.id", ondelete="SET NULL")
    )
    substance: Mapped[str | None] = mapped_column(Text)  # free-text when no med link
    amount: Mapped[str | None] = mapped_column(Text)  # e.g. "1", "2 capsules"
    # Times of day this step is taken: e.g. {"breakfast", "dinner"}.
    timing: Mapped[list[str]] = mapped_column(ARRAY(Text), server_default="{}")
    frequency: Mapped[str | None] = mapped_column(Text)
    trigger: Mapped[str | None] = mapped_column(Text)  # e.g. "if plateaued, 2-4 wk"
    sort_order: Mapped[int] = mapped_column(
        Integer, server_default="0", nullable=False
    )
    notes: Mapped[str | None] = mapped_column(Text)


class HealthEvent(UUIDPrimaryKey, TimestampMixin, Base):
    """A dated clinical record entry: a visit, lab, procedure, result, or symptom."""

    __tablename__ = "health_events"

    occurred_on: Mapped[date] = mapped_column(Date, nullable=False, index=True)
    event_type: Mapped[str] = mapped_column(
        Text, server_default="appointment", nullable=False
    )  # appointment/lab/procedure/surgery/imaging/test/vaccination/injury/symptom/note
    title: Mapped[str] = mapped_column(Text, nullable=False)
    provider_id: Mapped[uuid.UUID | None] = _people_fk()
    organization_id: Mapped[uuid.UUID | None] = _org_fk()
    condition_id: Mapped[uuid.UUID | None] = _condition_fk()
    summary: Mapped[str | None] = mapped_column(Text)
    findings: Mapped[str | None] = mapped_column(Text)
    recommendations: Mapped[str | None] = mapped_column(Text)
    follow_up: Mapped[str | None] = mapped_column(Text)
    follow_up_date: Mapped[date | None] = mapped_column(Date)
    location: Mapped[str | None] = mapped_column(Text)
    external_ref: Mapped[str | None] = mapped_column(Text)  # OneDrive/MyChart pointer
    notes: Mapped[str | None] = mapped_column(Text)


class InsurancePlan(UUIDPrimaryKey, TimestampMixin, Base):
    """An insurance plan and the identifiers needed to use it."""

    __tablename__ = "insurance_plans"

    name: Mapped[str] = mapped_column(Text, nullable=False)
    plan_type: Mapped[str | None] = mapped_column(
        Text
    )  # medical/dental/vision/pharmacy
    organization_id: Mapped[uuid.UUID | None] = _org_fk()
    network: Mapped[str | None] = mapped_column(Text)
    member_id: Mapped[str | None] = mapped_column(Text)
    group_number: Mapped[str | None] = mapped_column(Text)
    rx_bin: Mapped[str | None] = mapped_column(Text)
    rx_pcn: Mapped[str | None] = mapped_column(Text)
    rx_group: Mapped[str | None] = mapped_column(Text)
    phone: Mapped[str | None] = mapped_column(Text)
    status: Mapped[str] = mapped_column(
        Text, server_default="active", nullable=False
    )  # active/inactive
    notes: Mapped[str | None] = mapped_column(Text)


class Allergy(UUIDPrimaryKey, TimestampMixin, Base):
    """An allergy or intolerance."""

    __tablename__ = "allergies"

    substance: Mapped[str] = mapped_column(Text, nullable=False)
    allergy_type: Mapped[str | None] = mapped_column(
        Text
    )  # medication/food/environmental/other
    reaction: Mapped[str | None] = mapped_column(Text)
    severity: Mapped[str | None] = mapped_column(Text)  # mild/moderate/severe/unknown
    status: Mapped[str] = mapped_column(
        Text, server_default="active", nullable=False
    )  # active/suspected/resolved
    noted_on: Mapped[date | None] = mapped_column(Date)
    notes: Mapped[str | None] = mapped_column(Text)
