"""Organizations and the people affiliated with them."""

import uuid
from datetime import date

from sqlalchemy import Boolean, Date, ForeignKey, Text, text
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column

from personal_api.db.base import Base
from personal_api.models.mixins import TimestampMixin, UUIDPrimaryKey


class Organization(UUIDPrimaryKey, TimestampMixin, Base):
    """A company, institution, or group that people and work relate to."""

    __tablename__ = "organizations"

    name: Mapped[str] = mapped_column(Text, nullable=False)
    org_type: Mapped[str | None] = mapped_column(
        Text
    )  # employer/client/vendor/partner/nonprofit/school/government/community/other
    industry: Mapped[str | None] = mapped_column(Text)
    website: Mapped[str | None] = mapped_column(Text)
    email: Mapped[str | None] = mapped_column(Text)
    phone: Mapped[str | None] = mapped_column(Text)
    address: Mapped[str | None] = mapped_column(Text)
    description: Mapped[str | None] = mapped_column(Text)
    status: Mapped[str] = mapped_column(
        Text, server_default="active", nullable=False
    )  # active/inactive/archived
    notes: Mapped[str | None] = mapped_column(Text)


class Affiliation(UUIDPrimaryKey, TimestampMixin, Base):
    """A person's role at an organization (people <-> organizations, many-to-many).

    A person can have several affiliations (current and past); ``is_primary``
    marks the one to surface as their main organization.
    """

    __tablename__ = "affiliations"

    person_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("people.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    organization_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("organizations.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    role: Mapped[str | None] = mapped_column(Text)  # title/role at the org
    is_primary: Mapped[bool] = mapped_column(
        Boolean, server_default=text("false"), nullable=False
    )
    start_date: Mapped[date | None] = mapped_column(Date)
    end_date: Mapped[date | None] = mapped_column(Date)  # null = current
