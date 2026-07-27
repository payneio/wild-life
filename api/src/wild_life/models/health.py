"""Health domain: medications, insurance, allergies.

Providers are ordinary ``Person`` records (with a ``specialty``) linked to their
clinic via ``Affiliation``; clinics/pharmacies/insurers are ``Organization``s;
numeric labs/vitals ride the existing ``Metric``/``MetricEntry``. A *condition* is
not a table here — it is a ``Program`` in the Health area, because a condition and
a program are the same thing: something you have decided to pay attention to.
So what a medication treats is the program it belongs to. Nor is a *protocol*: it
is grouped routines aimed at an outcome, which any program can have.
"""

import uuid
from datetime import date

from sqlalchemy import Date, ForeignKey, Text
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column

from wild_life.db.base import Base
from wild_life.models.mixins import TimestampMixin, UUIDPrimaryKey


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


def _area_fk() -> Mapped[uuid.UUID | None]:
    return mapped_column(
        UUID(as_uuid=True), ForeignKey("areas.id", ondelete="SET NULL"), index=True
    )


def _program_fk() -> Mapped[uuid.UUID | None]:
    return mapped_column(
        UUID(as_uuid=True), ForeignKey("programs.id", ondelete="SET NULL"), index=True
    )


class Medication(UUIDPrimaryKey, TimestampMixin, Base):
    """A drug or supplement regimen — what you take, how much, when, and why."""

    __tablename__ = "medications"

    name: Mapped[str] = mapped_column(Text, nullable=False)  # usually the generic
    brand: Mapped[str | None] = mapped_column(Text)  # e.g. Lipitor
    med_type: Mapped[str] = mapped_column(
        Text, server_default="supplement", nullable=False
    )  # prescription/otc/supplement
    # A medication is product identity only — no quantities, no status, no dates. The
    # dose (amount + unit) lives on the Routine (prescribed) and the intake (taken);
    # whether you're "on" it, and since/until when, derive from its protocol steps
    # (see regimen.py).
    reason: Mapped[str | None] = mapped_column(Text)
    program_id: Mapped[uuid.UUID | None] = _program_fk()  # what it treats
    prescriber_id: Mapped[uuid.UUID | None] = _people_fk()
    pharmacy_id: Mapped[uuid.UUID | None] = _org_fk()
    instructions: Mapped[str | None] = mapped_column(Text)
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
