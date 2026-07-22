"""Append-only change log — one row per insert/update/delete of any entity."""

import uuid
from datetime import datetime

from sqlalchemy import DateTime, Text, func
from sqlalchemy.dialects.postgresql import JSONB, UUID
from sqlalchemy.orm import Mapped, mapped_column

from wild_life.db.base import Base
from wild_life.models.mixins import UUIDPrimaryKey


class ChangeLog(UUIDPrimaryKey, Base):
    """A single recorded change to a domain entity.

    Written automatically by the audit hook (``db.audit``) on every flush, never
    mutated afterward — this table is the history feed. ``changes`` holds a
    per-field ``{old, new}`` diff for updates and a full field snapshot for
    inserts/deletes.
    """

    __tablename__ = "change_log"

    # Source table name, e.g. "tasks" — the entity that changed.
    entity_type: Mapped[str] = mapped_column(Text, nullable=False, index=True)
    # Primary key of the changed entity (null for keyless join-table rows).
    entity_id: Mapped[uuid.UUID | None] = mapped_column(UUID(as_uuid=True), index=True)
    # Human-readable summary of the entity at change time (name/title/…).
    entity_label: Mapped[str | None] = mapped_column(Text)
    # "insert" | "update" | "delete".
    action: Mapped[str] = mapped_column(Text, nullable=False)
    # Field-level diff (update) or snapshot (insert/delete).
    changes: Mapped[dict] = mapped_column(JSONB, nullable=False, server_default="{}")
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        server_default=func.now(),
        nullable=False,
        index=True,
    )
