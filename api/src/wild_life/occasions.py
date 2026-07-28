"""An occasion and its shared projection, as one thing to read.

iMIP deals in a pairing: what the meeting *is* (a moment — title, when, body) and
what has been *said about it to other people* (a calendar record — UID, ORGANIZER,
SEQUENCE, ATTENDEE, RSVP). Before the inversion both lived on one `events` row,
which is why privacy had to be a filter: everything was equally exportable, and
the question "may this leave?" had no structural answer.

Now it does. **A moment with no calendar record has nothing to export**, so this
type cannot even be constructed for one, and every send path takes it. That is
the invariant `tests/test_export_privacy.py` pins, expressed as a type.

Reads are convenient; **writes are not**. There are no setters here on purpose —
`occ.record.sequence = n` says out loud that a sequence number is something we
tell other systems, and `occ.moment.title = t` that a title is ours. Collapsing
those into one mutable surface is exactly how they got confused in the first
place.
"""

from __future__ import annotations

from dataclasses import dataclass
from datetime import datetime
from uuid import UUID

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from wild_life.models.moments import CalendarRecord, Moment


@dataclass(frozen=True)
class Occasion:
    """A moment that has been given something to share."""

    moment: Moment
    record: CalendarRecord

    # --- identity ---------------------------------------------------------- #
    @property
    def id(self) -> UUID:
        return self.moment.id

    # --- what the meeting is (ours) ---------------------------------------- #
    @property
    def title(self) -> str | None:
        return self.moment.title

    @property
    def description(self) -> str | None:
        return self.moment.body or None

    @property
    def start_at(self) -> datetime | None:
        return self.moment.started_at or self.moment.window_start

    @property
    def end_at(self) -> datetime | None:
        return self.moment.ended_at

    @property
    def all_day(self) -> bool:
        return self.moment.all_day

    # --- what has been said about it (theirs) ------------------------------ #
    @property
    def external_ref(self) -> str | None:
        return self.record.external_ref

    @property
    def organizer(self) -> str | None:
        return self.record.organizer

    @property
    def sequence(self) -> int | None:
        return self.record.sequence

    @property
    def attendees(self) -> list[str]:
        return list(self.record.attendees or [])

    @property
    def invites_enabled(self) -> bool:
        return bool(self.record.invites_enabled)

    @property
    def cancelled_at(self) -> datetime | None:
        return self.record.cancelled_at

    @property
    def rsvp_status(self) -> str | None:
        return self.record.rsvp_status

    @property
    def rsvp_sent_status(self) -> str | None:
        return self.record.rsvp_sent_status

    @property
    def invite_signature(self) -> str | None:
        return self.record.invite_signature

    @property
    def location(self) -> str | None:
        return self.record.location

    @property
    def recurrence(self) -> str | None:
        return self.record.recurrence

    @property
    def recurrence_id(self) -> datetime | None:
        return self.record.recurrence_id


async def load(session: AsyncSession, moment_id: UUID) -> Occasion | None:
    """The occasion for this moment, or None when it has nothing to share."""
    record = await session.get(CalendarRecord, moment_id)
    if record is None:
        return None
    moment = await session.get(Moment, moment_id)
    return None if moment is None else Occasion(moment, record)


async def by_ref(session: AsyncSession, uid: str) -> Occasion | None:
    """The occasion a wire UID names."""
    record = (
        await session.execute(
            select(CalendarRecord).where(CalendarRecord.external_ref == uid)
        )
    ).scalar_one_or_none()
    if record is None:
        return None
    moment = await session.get(Moment, record.moment_id)
    return None if moment is None else Occasion(moment, record)


async def outbound(session: AsyncSession) -> list[Occasion]:
    """Every occasion carrying invite state or an RSVP to relay.

    Bounded by the projection table rather than by moments, which is the whole
    point: the candidate set for anything leaving this system is "things given a
    record", not "things that exist".
    """
    from sqlalchemy import or_

    rows = (
        await session.execute(
            select(CalendarRecord, Moment)
            .join(Moment, Moment.id == CalendarRecord.moment_id)
            .where(
                or_(
                    CalendarRecord.invites_enabled.is_(True),
                    CalendarRecord.cancelled_at.isnot(None),
                    CalendarRecord.organizer.isnot(None),
                )
            )
        )
    ).all()
    return [Occasion(moment, record) for record, moment in rows]
