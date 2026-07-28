"""People — the CRM surface.

Touchpoints are not a table here. A logged interaction is a dated observation
about a person, which is exactly a Note rooted at them — and a Note carries
mentions, tags, images and search that the old `interactions` table did not.
"""

from datetime import date

from sqlalchemy import Date, Text
from sqlalchemy.dialects.postgresql import ARRAY, JSONB
from sqlalchemy.orm import Mapped, mapped_column

from wild_life.db.base import Base
from wild_life.models.mixins import TimestampMixin, UUIDPrimaryKey


class Person(UUIDPrimaryKey, TimestampMixin, Base):
    """A contact involved in the user's life, work, or delegated work."""

    __tablename__ = "people"

    name: Mapped[str] = mapped_column(Text, nullable=False)
    nickname: Mapped[str | None] = mapped_column(Text)
    relationship: Mapped[str | None] = mapped_column(Text)
    role: Mapped[str | None] = mapped_column(Text)
    job_title: Mapped[str | None] = mapped_column(Text)
    # Provider fields (null for ordinary contacts): medical specialty, my patient
    # identifier with them, and their patient-portal URL.
    specialty: Mapped[str | None] = mapped_column(Text)
    patient_id: Mapped[str | None] = mapped_column(Text)
    portal_url: Mapped[str | None] = mapped_column(Text)
    # Typed contact methods: list of {"value": str, "label": str|None}.
    phones: Mapped[list[dict]] = mapped_column(
        JSONB, server_default="[]", nullable=False
    )
    emails: Mapped[list[dict]] = mapped_column(
        JSONB, server_default="[]", nullable=False
    )
    addresses: Mapped[list[dict]] = mapped_column(
        JSONB, server_default="[]", nullable=False
    )
    websites: Mapped[list[str]] = mapped_column(ARRAY(Text), server_default="{}")
    preferred_contact: Mapped[str | None] = mapped_column(Text)
    birthday: Mapped[date | None] = mapped_column(Date)
    # Other dated milestones: list of {"label": str, "date": str}.
    important_dates: Mapped[list[dict]] = mapped_column(
        JSONB, server_default="[]", nullable=False
    )
    photo_url: Mapped[str | None] = mapped_column(Text)
