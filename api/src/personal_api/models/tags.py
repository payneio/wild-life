"""Tag — lightweight non-hierarchical labels, attachable to any entity."""

import uuid

from sqlalchemy import ForeignKey, Text, UniqueConstraint
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column

from personal_api.db.base import Base
from personal_api.models.mixins import TimestampMixin, UUIDPrimaryKey


class Tag(UUIDPrimaryKey, TimestampMixin, Base):
    __tablename__ = "tags"
    __table_args__ = (UniqueConstraint("name", name="uq_tags_name"),)

    name: Mapped[str] = mapped_column(Text, nullable=False)
    color: Mapped[str | None] = mapped_column(Text)


class EntityTag(Base):
    """Attach a tag to any entity (soft polymorphic)."""

    __tablename__ = "entity_tags"

    tag_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("tags.id", ondelete="CASCADE"), primary_key=True
    )
    entity_type: Mapped[str] = mapped_column(Text, primary_key=True)
    entity_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True)
