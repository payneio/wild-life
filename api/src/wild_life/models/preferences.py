"""Preference — a generic single-user key/value settings store.

No settings table existed before; this is deliberately generic (one JSONB blob
per key) so future settings reuse it. The ``"calendar"`` key holds invite/RSVP
preferences (see ``schemas/preferences.py``).
"""

from datetime import datetime

from sqlalchemy import DateTime, Text, func
from sqlalchemy.dialects.postgresql import JSONB
from sqlalchemy.orm import Mapped, mapped_column

from wild_life.db.base import Base


class Preference(Base):
    __tablename__ = "preferences"

    key: Mapped[str] = mapped_column(Text, primary_key=True)
    value: Mapped[dict] = mapped_column(JSONB, nullable=False, server_default="{}")
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        server_default=func.now(),
        onupdate=func.now(),
        nullable=False,
    )
