"""Organization, and the Affiliations that attach people to it.

An organization is a **reference entity**: it is a subject of moments, never a
moment itself, and it has no lifecycle of its own beyond `status`.

Affiliation is deliberately its own row rather than a column on Person, because
it is time-bounded (`start_date`/`end_date`, null end = current) and a person may
hold several at once. `is_primary` picks the one to show in a reference chip.
Retaining ended affiliations is what lets "who did I know at Acme in 2024" be a
query rather than a memory.

Postal components follow the vCard `ADR` / schema.org `PostalAddress`
intersection, the same vocabulary Location and Person use.
"""

import uuid
from datetime import date

from sqlalchemy import Boolean, Date, ForeignKey, Text, text
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column

from wild_life.db.base import Base
from wild_life.models.mixins import TimestampMixin, UUIDPrimaryKey


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
    # Shared postal-address vocabulary — see schemas/common.PostalAddress. This
    # was a single free-text blob; the migration moves whatever was in it into
    # `street` verbatim rather than guessing at its components.
    street: Mapped[str | None] = mapped_column(Text)
    unit: Mapped[str | None] = mapped_column(Text)
    city: Mapped[str | None] = mapped_column(Text)
    region: Mapped[str | None] = mapped_column(Text)
    postcode: Mapped[str | None] = mapped_column(Text)
    country: Mapped[str | None] = mapped_column(Text)

    description: Mapped[str | None] = mapped_column(Text)
    status: Mapped[str] = mapped_column(
        Text, server_default="active", nullable=False
    )  # active/inactive/archived


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
