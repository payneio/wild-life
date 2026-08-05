"""Review — the act of examining a scope, and where standing claims get judged.

Load-bearing rather than reporting. Two things in `docs/domain.md` converge here:
a scope is *examined* at review, and a non-monotonic outcome ("no important
relationship neglected") has its truth value *evaluated* at review. Those are the
same act — looking at a scope is when its standing claims become true or false.

That is what makes an outcome with neither a metric nor a review cadence *inert*:
nothing can ever change its truth value.

`entities_reviewed` is why examination does not inherit. A cadence declared at a
scope applies downward, but reviewing a program covers its projects only if this
column says it did.
"""

from datetime import date, datetime

from sqlalchemy import Date, DateTime, Text
from sqlalchemy.dialects.postgresql import ARRAY
from sqlalchemy.orm import Mapped, mapped_column

from wild_life.db.base import Base
from wild_life.models.mixins import TimestampMixin, UUIDPrimaryKey


class Review(UUIDPrimaryKey, TimestampMixin, Base):
    __tablename__ = "reviews"

    review_type: Mapped[str] = mapped_column(
        Text, nullable=False
    )  # daily/weekly/monthly/quarterly/area/program/project/delegation
    period_start: Mapped[date | None] = mapped_column(Date)
    period_end: Mapped[date | None] = mapped_column(Date)
    entities_reviewed: Mapped[list[str]] = mapped_column(
        ARRAY(Text), server_default="{}"
    )
    observations: Mapped[str | None] = mapped_column(Text)
    decisions: Mapped[str | None] = mapped_column(Text)
    risks: Mapped[str | None] = mapped_column(Text)
    follow_up_actions: Mapped[str | None] = mapped_column(Text)
    completed_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
