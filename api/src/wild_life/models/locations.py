"""Locations: physical places (home, work, venues, cities) worth linking to."""

from sqlalchemy import Text
from sqlalchemy.orm import Mapped, mapped_column

from wild_life.db.base import Base
from wild_life.models.mixins import TimestampMixin, UUIDPrimaryKey


class Location(UUIDPrimaryKey, TimestampMixin, Base):
    """A place people, events, and journal entries relate to."""

    __tablename__ = "locations"

    name: Mapped[str] = mapped_column(Text, nullable=False)
    category: Mapped[str | None] = mapped_column(Text)  # home/work/venue/city/other
    address: Mapped[str | None] = mapped_column(Text)
    city: Mapped[str | None] = mapped_column(Text)
    region: Mapped[str | None] = mapped_column(Text)
    notes: Mapped[str | None] = mapped_column(Text)
