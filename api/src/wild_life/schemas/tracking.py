"""Schemas for Commitment, Delegation."""

import uuid
from datetime import date

from pydantic import BaseModel

from wild_life.schemas.common import (
    CommitmentStatus,
    DelegationStatus,
    Entity,
    EntityType,
    Priority,
)


# --- Commitment -------------------------------------------------------------
class CommitmentCreate(BaseModel):
    description: str
    owner_id: uuid.UUID | None = None
    beneficiary_id: uuid.UUID | None = None
    responsible_id: uuid.UUID | None = None
    date_made: date | None = None
    due_date: date | None = None
    status: CommitmentStatus = "open"
    evidence: str | None = None
    acceptance_status: str | None = None
    entity_type: EntityType | None = None
    entity_id: uuid.UUID | None = None
    notes: str | None = None


class CommitmentUpdate(BaseModel):
    description: str | None = None
    owner_id: uuid.UUID | None = None
    beneficiary_id: uuid.UUID | None = None
    responsible_id: uuid.UUID | None = None
    date_made: date | None = None
    due_date: date | None = None
    status: CommitmentStatus | None = None
    evidence: str | None = None
    acceptance_status: str | None = None
    entity_type: EntityType | None = None
    entity_id: uuid.UUID | None = None
    notes: str | None = None


class CommitmentRead(Entity):
    description: str
    owner_id: uuid.UUID | None
    beneficiary_id: uuid.UUID | None
    responsible_id: uuid.UUID | None
    date_made: date | None
    due_date: date | None
    status: str
    evidence: str | None
    acceptance_status: str | None
    entity_type: str | None
    entity_id: uuid.UUID | None
    notes: str | None


# --- Delegation -------------------------------------------------------------
class DelegationCreate(BaseModel):
    requested_outcome: str
    entity_type: EntityType | None = None
    entity_id: uuid.UUID | None = None
    delegator_id: uuid.UUID | None = None
    responsible_id: uuid.UUID | None = None
    accountable_owner_id: uuid.UUID | None = None
    date_delegated: date | None = None
    instructions: str | None = None
    priority: Priority = "medium"
    expected_completion_date: date | None = None
    follow_up_date: date | None = None
    acceptance_required: bool = False
    status: DelegationStatus = "draft"
    latest_update: str | None = None
    last_contact_date: date | None = None
    delivered_date: date | None = None
    accepted_date: date | None = None
    completion_evidence: str | None = None
    escalation_level: int = 0
    notes: str | None = None


class DelegationUpdate(BaseModel):
    requested_outcome: str | None = None
    entity_type: EntityType | None = None
    entity_id: uuid.UUID | None = None
    delegator_id: uuid.UUID | None = None
    responsible_id: uuid.UUID | None = None
    accountable_owner_id: uuid.UUID | None = None
    date_delegated: date | None = None
    instructions: str | None = None
    priority: Priority | None = None
    expected_completion_date: date | None = None
    follow_up_date: date | None = None
    acceptance_required: bool | None = None
    status: DelegationStatus | None = None
    latest_update: str | None = None
    last_contact_date: date | None = None
    delivered_date: date | None = None
    accepted_date: date | None = None
    completion_evidence: str | None = None
    escalation_level: int | None = None
    notes: str | None = None


class DelegationRead(Entity):
    requested_outcome: str
    entity_type: str | None
    entity_id: uuid.UUID | None
    delegator_id: uuid.UUID | None
    responsible_id: uuid.UUID | None
    accountable_owner_id: uuid.UUID | None
    date_delegated: date | None
    instructions: str | None
    priority: str
    expected_completion_date: date | None
    follow_up_date: date | None
    acceptance_required: bool
    status: str
    latest_update: str | None
    last_contact_date: date | None
    delivered_date: date | None
    accepted_date: date | None
    completion_evidence: str | None
    escalation_level: int
    notes: str | None
