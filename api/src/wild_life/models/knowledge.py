"""Resource and Decision — references held, and choices recorded.

A **Decision** is the one place deliberation is durably represented. The model
otherwise declines to hold it: competing routes live in prose and the system's
entry point is commitment (`docs/domain.md` -> "What this is not"). A Decision is
the *outcome* of deliberating, with its rationale and assumptions, not the
deliberation itself.

`review_date` exists because an assumption can expire — a decision worth
recording is one worth revisiting when what it assumed stops holding.

Both carry a nullable `entity_type`/`entity_id` scope, which means a row can
belong to nothing and nothing will notice. See `erd.md` -> Soft polymorphic
edges.
"""

import uuid
from datetime import date

from sqlalchemy import Date, ForeignKey, Text
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column

from wild_life.db.base import Base
from wild_life.models.mixins import TimestampMixin, UUIDPrimaryKey


class Resource(UUIDPrimaryKey, TimestampMixin, Base):
    __tablename__ = "resources"

    title: Mapped[str] = mapped_column(Text, nullable=False)
    resource_type: Mapped[str | None] = mapped_column(
        Text
    )  # link/document/book/template/tool/account/location/reference
    url: Mapped[str | None] = mapped_column(Text)
    description: Mapped[str | None] = mapped_column(Text)
    entity_type: Mapped[str | None] = mapped_column(Text)
    entity_id: Mapped[uuid.UUID | None] = mapped_column(UUID(as_uuid=True))


class Decision(UUIDPrimaryKey, TimestampMixin, Base):
    __tablename__ = "decisions"

    question: Mapped[str] = mapped_column(Text, nullable=False)
    options_considered: Mapped[str | None] = mapped_column(Text)
    decision: Mapped[str | None] = mapped_column(Text)
    rationale: Mapped[str | None] = mapped_column(Text)
    assumptions: Mapped[str | None] = mapped_column(Text)
    owner_id: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True), ForeignKey("people.id", ondelete="SET NULL")
    )
    decided_on: Mapped[date | None] = mapped_column(Date)
    review_date: Mapped[date | None] = mapped_column(Date)
    entity_type: Mapped[str | None] = mapped_column(Text)
    entity_id: Mapped[uuid.UUID | None] = mapped_column(UUID(as_uuid=True))
