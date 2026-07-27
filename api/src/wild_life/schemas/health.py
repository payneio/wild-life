"""Pydantic schemas for the health domain."""

import uuid
from datetime import date
from typing import Literal

from pydantic import BaseModel

from wild_life.schemas.common import Entity, PhoneNumber

# --- enums ------------------------------------------------------------------
MedType = Literal["prescription", "otc", "supplement"]
Weekday = Literal["mon", "tue", "wed", "thu", "fri", "sat", "sun"]
PlanType = Literal["medical", "dental", "vision", "pharmacy"]
PlanStatus = Literal["active", "inactive"]
AllergyType = Literal["medication", "food", "environmental", "other"]
AllergySeverity = Literal["mild", "moderate", "severe", "unknown"]
AllergyStatus = Literal["active", "suspected", "resolved"]


# --- Medication -------------------------------------------------------------
class MedicationCreate(BaseModel):
    name: str
    brand: str | None = None
    med_type: MedType = "supplement"
    reason: str | None = None
    program_id: uuid.UUID | None = None
    prescriber_id: uuid.UUID | None = None
    pharmacy_id: uuid.UUID | None = None
    instructions: str | None = None
    notes: str | None = None


class MedicationUpdate(BaseModel):
    name: str | None = None
    brand: str | None = None
    med_type: MedType | None = None
    reason: str | None = None
    program_id: uuid.UUID | None = None
    prescriber_id: uuid.UUID | None = None
    pharmacy_id: uuid.UUID | None = None
    instructions: str | None = None
    notes: str | None = None


class MedicationRead(Entity):
    name: str
    brand: str | None
    med_type: MedType
    reason: str | None
    program_id: uuid.UUID | None
    prescriber_id: uuid.UUID | None
    pharmacy_id: uuid.UUID | None
    instructions: str | None
    notes: str | None


# --- Protocol ---------------------------------------------------------------
class ProtocolCreate(BaseModel):
    name: str
    category: str | None = None
    intended_outcome: str | None = None
    paused: bool = False
    area_id: uuid.UUID | None = None
    program_id: uuid.UUID | None = None
    start_date: date | None = None
    end_date: date | None = None
    duration: str | None = None
    provider_id: uuid.UUID | None = None
    notes: str | None = None


class ProtocolUpdate(BaseModel):
    name: str | None = None
    category: str | None = None
    intended_outcome: str | None = None
    paused: bool | None = None
    area_id: uuid.UUID | None = None
    program_id: uuid.UUID | None = None
    start_date: date | None = None
    end_date: date | None = None
    duration: str | None = None
    provider_id: uuid.UUID | None = None
    notes: str | None = None


class ProtocolRead(Entity):
    name: str
    category: str | None
    intended_outcome: str | None
    paused: bool
    area_id: uuid.UUID | None
    program_id: uuid.UUID | None
    start_date: date | None
    end_date: date | None
    duration: str | None
    provider_id: uuid.UUID | None
    notes: str | None


# --- InsurancePlan ----------------------------------------------------------
class InsurancePlanCreate(BaseModel):
    name: str
    plan_type: PlanType | None = None
    organization_id: uuid.UUID | None = None
    network: str | None = None
    member_id: str | None = None
    group_number: str | None = None
    rx_bin: str | None = None
    rx_pcn: str | None = None
    rx_group: str | None = None
    phone: PhoneNumber = None
    status: PlanStatus = "active"
    notes: str | None = None


class InsurancePlanUpdate(BaseModel):
    name: str | None = None
    plan_type: PlanType | None = None
    organization_id: uuid.UUID | None = None
    network: str | None = None
    member_id: str | None = None
    group_number: str | None = None
    rx_bin: str | None = None
    rx_pcn: str | None = None
    rx_group: str | None = None
    phone: PhoneNumber = None
    status: PlanStatus | None = None
    notes: str | None = None


class InsurancePlanRead(Entity):
    name: str
    plan_type: PlanType | None
    organization_id: uuid.UUID | None
    network: str | None
    member_id: str | None
    group_number: str | None
    rx_bin: str | None
    rx_pcn: str | None
    rx_group: str | None
    phone: str | None
    status: PlanStatus
    notes: str | None


# --- Allergy ----------------------------------------------------------------
class AllergyCreate(BaseModel):
    substance: str
    allergy_type: AllergyType | None = None
    reaction: str | None = None
    severity: AllergySeverity | None = None
    status: AllergyStatus = "active"
    noted_on: date | None = None
    notes: str | None = None


class AllergyUpdate(BaseModel):
    substance: str | None = None
    allergy_type: AllergyType | None = None
    reaction: str | None = None
    severity: AllergySeverity | None = None
    status: AllergyStatus | None = None
    noted_on: date | None = None
    notes: str | None = None


class AllergyRead(Entity):
    substance: str
    allergy_type: AllergyType | None
    reaction: str | None
    severity: AllergySeverity | None
    status: AllergyStatus
    noted_on: date | None
    notes: str | None


class RegimenEntry(BaseModel):
    """One routine due today — a med dose, supplement, activity, or habit.

    Derived from the active Routines (see ``regimen.py``). ``routine_id`` is the
    unit to complete; ``kind`` labels what it is; ``source_protocol_*`` names the
    governing protocol (null for a standalone routine). Deduped per (medication,
    slot) for meds, or (routine, slot) otherwise.
    """

    routine_id: uuid.UUID
    label: str  # medication name, or the activity/habit text
    kind: str  # medication / supplement / activity / routine
    slot: str  # a med's time-of-day, or "" for a slotless habit
    # Required-but-nullable: `regimen.py` always supplies all five, so the
    # response always carries the keys. Defaults here would tell clients the
    # keys may be absent, which is a different (and untrue) contract.
    medication_id: uuid.UUID | None
    amount: float | None  # the prescribed dose amount
    unit: str | None  # the dose unit (mg/ml/…)
    source_protocol_id: uuid.UUID | None
    source_protocol_name: str | None
