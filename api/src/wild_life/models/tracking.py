"""Commitments, waiting items, and delegations — the oversight cluster."""

import uuid
from datetime import date

from sqlalchemy import Boolean, Date, ForeignKey, Integer, Text
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column

from wild_life.db.base import Base
from wild_life.models.mixins import TimestampMixin, UUIDPrimaryKey


def _person(index: bool = False) -> Mapped[uuid.UUID | None]:
    return mapped_column(
        UUID(as_uuid=True), ForeignKey("people.id", ondelete="SET NULL"), index=index
    )


class Commitment(UUIDPrimaryKey, TimestampMixin, Base):
    """A promise or obligation owed to oneself or another."""

    __tablename__ = "commitments"

    description: Mapped[str] = mapped_column(Text, nullable=False)
    owner_id: Mapped[uuid.UUID | None] = _person()
    beneficiary_id: Mapped[uuid.UUID | None] = _person()
    responsible_id: Mapped[uuid.UUID | None] = _person()
    date_made: Mapped[date | None] = mapped_column(Date)
    due_date: Mapped[date | None] = mapped_column(Date)
    status: Mapped[str] = mapped_column(
        Text, server_default="open", nullable=False
    )  # open/in_progress/waiting/fulfilled/broken/cancelled
    evidence: Mapped[str | None] = mapped_column(Text)
    acceptance_status: Mapped[str | None] = mapped_column(Text)
    # Soft link to area/program/project/person.
    entity_type: Mapped[str | None] = mapped_column(Text)
    entity_id: Mapped[uuid.UUID | None] = mapped_column(UUID(as_uuid=True))
    notes: Mapped[str | None] = mapped_column(Text)


class Delegation(UUIDPrimaryKey, TimestampMixin, Base):
    """Execution responsibility transferred to another person."""

    __tablename__ = "delegations"

    # What was delegated (soft polymorphic link).
    entity_type: Mapped[str | None] = mapped_column(Text)
    entity_id: Mapped[uuid.UUID | None] = mapped_column(UUID(as_uuid=True))
    delegator_id: Mapped[uuid.UUID | None] = _person()
    responsible_id: Mapped[uuid.UUID | None] = _person(index=True)
    accountable_owner_id: Mapped[uuid.UUID | None] = _person()
    date_delegated: Mapped[date | None] = mapped_column(Date)
    requested_outcome: Mapped[str] = mapped_column(Text, nullable=False)
    instructions: Mapped[str | None] = mapped_column(Text)
    priority: Mapped[str] = mapped_column(
        Text, server_default="medium", nullable=False
    )  # low/medium/high/urgent
    expected_completion_date: Mapped[date | None] = mapped_column(Date)
    follow_up_date: Mapped[date | None] = mapped_column(Date, index=True)
    acceptance_required: Mapped[bool] = mapped_column(
        Boolean, server_default="false", nullable=False
    )
    status: Mapped[str] = mapped_column(
        Text, server_default="draft", nullable=False
    )  # draft/requested/accepted/in_progress/waiting_for_update/blocked/
    # delivered/revision_requested/accepted_as_complete/declined/reassigned/cancelled
    latest_update: Mapped[str | None] = mapped_column(Text)
    last_contact_date: Mapped[date | None] = mapped_column(Date)
    delivered_date: Mapped[date | None] = mapped_column(Date)
    accepted_date: Mapped[date | None] = mapped_column(Date)
    completion_evidence: Mapped[str | None] = mapped_column(Text)
    escalation_level: Mapped[int] = mapped_column(
        Integer, server_default="0", nullable=False
    )
    notes: Mapped[str | None] = mapped_column(Text)
