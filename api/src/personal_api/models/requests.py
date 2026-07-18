"""Request — the two-party ask/answer primitive that powers every actor's inbox.

A Request is "requester needs <something> from addressee". Each Person's inbox is the
open Requests addressed to them; "waiting on others" is the open Requests they made.
Folds in the retired WaitingItem (a deliverable you're waiting on is a Request you
made with kind='deliverable').
"""

import uuid
from datetime import date, datetime

from sqlalchemy import Date, DateTime, ForeignKey, Text
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column

from personal_api.db.base import Base
from personal_api.models.mixins import TimestampMixin, UUIDPrimaryKey


def _person(index: bool = False) -> Mapped[uuid.UUID | None]:
    return mapped_column(
        UUID(as_uuid=True), ForeignKey("people.id", ondelete="SET NULL"), index=index
    )


class Request(UUIDPrimaryKey, TimestampMixin, Base):
    __tablename__ = "requests"

    requester_id: Mapped[uuid.UUID | None] = _person(index=True)
    # Whose inbox this lands in. Null when the addressee is external (see label).
    addressee_id: Mapped[uuid.UUID | None] = _person(index=True)
    external_label: Mapped[str | None] = mapped_column(Text)
    kind: Mapped[str] = mapped_column(
        Text, server_default="question", nullable=False
    )  # question/decision/input/deliverable
    subject: Mapped[str] = mapped_column(Text, nullable=False)
    body: Mapped[str | None] = mapped_column(Text)
    # Soft link to the task/project/etc. this concerns.
    entity_type: Mapped[str | None] = mapped_column(Text)
    entity_id: Mapped[uuid.UUID | None] = mapped_column(UUID(as_uuid=True))
    needed_by: Mapped[date | None] = mapped_column(Date)
    follow_up_date: Mapped[date | None] = mapped_column(Date, index=True)
    status: Mapped[str] = mapped_column(
        Text, server_default="open", nullable=False
    )  # open/resolved/cancelled
    resolution: Mapped[str | None] = mapped_column(Text)
    resolved_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    last_communication: Mapped[str | None] = mapped_column(Text)
    next_action: Mapped[str | None] = mapped_column(Text)
    notes: Mapped[str | None] = mapped_column(Text)
