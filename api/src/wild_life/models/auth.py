"""API credentials — token hash -> Person + role.

**External** in the `docs/domain.md` sense: operational, not part of the life
model. Notable only because `role='worker'` is how a non-human actor acts as a
Person — which is the point at which "whose attention did this moment consume?"
stops being answerable, since a moment has no actor column.
"""

import uuid
from datetime import datetime

from sqlalchemy import DateTime, ForeignKey, Text
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column

from wild_life.db.base import Base
from wild_life.models.mixins import TimestampMixin, UUIDPrimaryKey


class ApiToken(UUIDPrimaryKey, TimestampMixin, Base):
    """A bearer credential. Only the hash is stored; the raw value is shown once."""

    __tablename__ = "api_tokens"

    label: Mapped[str] = mapped_column(Text, nullable=False)
    token_hash: Mapped[str] = mapped_column(
        Text, nullable=False, unique=True, index=True
    )
    # The Person this credential acts as (an AI assistant or a human).
    person_id: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True), ForeignKey("people.id", ondelete="SET NULL"), index=True
    )
    role: Mapped[str] = mapped_column(
        Text, server_default="worker", nullable=False
    )  # full/worker
    revoked_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
