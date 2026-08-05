"""EntityLink — a generic soft-polymorphic edge between any two entities.

The many-links complement to the single primary link (`entity_type`/`entity_id`).
Both ends are soft (no FK), so referential integrity here is the application's
job. Reverse lookups use the target index.

**`relation` is part of the primary key**, so one pair of entities may carry
several distinct relations — that is deliberate, and it is why the key is five
columns rather than four.
"""

import uuid

from sqlalchemy import Index, Text
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column

from wild_life.db.base import Base


class EntityLink(Base):
    __tablename__ = "entity_links"
    __table_args__ = (Index("ix_entity_links_target", "target_type", "target_id"),)

    source_type: Mapped[str] = mapped_column(Text, primary_key=True)
    source_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True)
    target_type: Mapped[str] = mapped_column(Text, primary_key=True)
    target_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True)
    relation: Mapped[str] = mapped_column(
        Text, primary_key=True, server_default="related"
    )
