"""The calendar's read path: one query for everything in a window.

**Expansion moved to the server, and that is the substance of it.** The browser
used to hold an RRULE library and expand 74 series itself, which meant the only
component that knew when a recurring meeting actually happened was the calendar
page — nothing else could ask, and a person's timeline or a program's history saw
one row where there were fifty-two.

Three sources reach one shape here, and a client should not have to know which
produced a given row:

1. **A plain moment.** One occurrence, itself.
2. **A moment carrying a wire rule we could not translate** — YEARLY,
   MONTHLY-by-weekday, COUNT. Expanded from the verbatim RRULE on its calendar
   record, which is decision 8's "materialised as the occurrences we were given".
3. **A rule of our own**, projected forward as wall times in its own zone
   (`rules.project`). Occurrences nothing has happened to are *not rows* — they
   are computed here and never stored (decision 10).

Where 3 has been touched, the stored moment wins: a moved occurrence carries
``rule_id`` and the ``occurrence_at`` slot it stands for, so it replaces the
projection at that slot rather than doubling it. A withdrawn one replaces it with
nothing. That pairing is what iCal needs ``RECURRENCE-ID`` and ``EXDATE`` for.
"""

from __future__ import annotations

from collections import defaultdict
from datetime import datetime, timedelta
from uuid import UUID

from fastapi import APIRouter, Depends, Query
from sqlalchemy import or_, select
from sqlalchemy.ext.asyncio import AsyncSession

from wild_life.db.session import get_session
from wild_life.models.moments import CalendarRecord, Moment, MomentLink
from wild_life.models.protocols import Protocol
from wild_life.models.routines import Routine
from wild_life.recurrence import expand
from wild_life.rules import project
from wild_life.schemas.common import MomentKind
from wild_life.schemas.moments import CalendarRecordRead, MomentLinkRef, Occurrence

router = APIRouter(tags=["calendar"])

# A window has to be bounded or a YEARLY rule expands forever. Generous enough
# that no view asks for more, small enough that nothing runs away.
MAX_WINDOW = timedelta(days=800)


async def _links_for(
    session: AsyncSession, ids: list[UUID]
) -> dict[UUID, list[MomentLinkRef]]:
    out: dict[UUID, list[MomentLinkRef]] = defaultdict(list)
    if not ids:
        return out
    rows = await session.execute(
        select(MomentLink).where(MomentLink.moment_id.in_(ids))
    )
    for link in rows.scalars():
        out[link.moment_id].append(
            MomentLinkRef(
                role=link.role, entity_type=link.entity_type, entity_id=link.entity_id
            )
        )
    return out


def _from_moment(
    moment: Moment,
    record: CalendarRecord | None,
    links: list[MomentLinkRef],
    *,
    at: datetime | None = None,
    start: datetime | None = None,
) -> Occurrence:
    begins = start or moment.started_at or moment.window_start
    ends = moment.ended_at
    if start is not None and moment.started_at and moment.ended_at:
        # An expanded occurrence keeps the series' duration, not the master's end.
        ends = start + (moment.ended_at - moment.started_at)
    return Occurrence(
        moment_id=moment.id,
        rule_id=moment.rule_id,
        occurrence_at=at or moment.occurrence_at or begins,
        start_at=begins,
        end_at=ends,
        all_day=moment.all_day,
        title=moment.title,
        body=moment.body or "",
        kind=moment.kind,
        withdrawn_at=moment.withdrawn_at,
        links=links,
        calendar=CalendarRecordRead.model_validate(record) if record else None,
    )


@router.get(
    "/occurrences", response_model=list[Occurrence], operation_id="occurrences_list"
)
async def list_occurrences(
    session: AsyncSession = Depends(get_session),
    since: datetime = Query(..., description="Window start (inclusive)"),
    until: datetime = Query(..., description="Window end (inclusive)"),
    kind: list[MomentKind] | None = Query(None),
    linked_type: str | None = None,
    linked_id: UUID | None = None,
) -> list[Occurrence]:
    """Everything happening in a window, stored or computed."""
    if until < since:
        since, until = until, since
    until = min(until, since + MAX_WINDOW)
    kinds = list(kind) if kind else ["occasion"]

    scoped: set[UUID] | None = None
    if linked_type and linked_id:
        scoped = {
            r
            for (r,) in await session.execute(
                select(MomentLink.moment_id).where(
                    MomentLink.entity_type == linked_type,
                    MomentLink.entity_id == linked_id,
                )
            )
        }

    # --- 1 & 2: stored moments -------------------------------------------- #
    stmt = (
        select(Moment, CalendarRecord)
        .outerjoin(CalendarRecord, CalendarRecord.moment_id == Moment.id)
        .where(Moment.kind.in_(kinds))
        .where(
            or_(
                # In the window on its own account...
                Moment.started_at.between(since, until),
                Moment.window_start.between(since, until),
                # ...or a series that may reach into it from before.
                CalendarRecord.recurrence.isnot(None),
                # ...or a materialised occurrence, placed by its slot.
                Moment.occurrence_at.between(since, until),
            )
        )
    )
    rows = list((await session.execute(stmt)).all())
    if scoped is not None:
        rows = [(m, c) for m, c in rows if m.id in scoped]
    links = await _links_for(session, [m.id for m, _ in rows])

    out: list[Occurrence] = []
    # Slots a stored row already speaks for, so a projection cannot double them.
    claimed: set[tuple[UUID, datetime]] = set()
    for moment, record in rows:
        if moment.rule_id is not None and moment.occurrence_at is not None:
            claimed.add((moment.rule_id, moment.occurrence_at))
            if moment.withdrawn_at is None:
                out.append(_from_moment(moment, record, links[moment.id]))
            continue
        if moment.rule_id is not None:
            # The series anchor. Its wire rule is kept verbatim for replay, but
            # *our* rule is what gets expanded — expanding both is what put the
            # same therapy appointment on the calendar twice every week.
            continue
        if record is not None and record.recurrence:
            # The wire rule we could not translate: expand it as we were given it.
            anchor = moment.started_at or moment.window_start
            if anchor is None:
                continue
            for occ in expand(
                record.recurrence,
                anchor,
                until=until,
                exdates=list(record.recurrence_exdates or []),
            ):
                if since <= occ <= until:
                    out.append(
                        _from_moment(
                            moment, record, links[moment.id], at=occ, start=occ
                        )
                    )
            continue
        when = moment.started_at or moment.window_start
        if when is not None and since <= when <= until:
            out.append(_from_moment(moment, record, links[moment.id]))

    # --- 3: rules of our own, projected ------------------------------------ #
    rule_rows = (
        await session.execute(
            select(Routine, Protocol)
            .outerjoin(Protocol, Protocol.id == Routine.protocol_id)
            .where(Routine.kind.in_(kinds))
        )
    ).all()
    rule_ids = [r.id for r, _ in rule_rows]
    rule_links: dict[UUID, list[MomentLinkRef]] = defaultdict(list)
    if rule_ids:
        from wild_life.models.routines import RuleLink

        for link in (
            (
                await session.execute(
                    select(RuleLink).where(RuleLink.rule_id.in_(rule_ids))
                )
            )
            .scalars()
            .all()
        ):
            rule_links[link.rule_id].append(
                MomentLinkRef(
                    role=link.role,
                    entity_type=link.entity_type,
                    entity_id=link.entity_id,
                )
            )

    for rule, protocol in rule_rows:
        if scoped is not None and not any(
            link.entity_id == linked_id for link in rule_links[rule.id]
        ):
            continue
        for occ in project(rule, protocol, since.date(), until.date()):
            if (rule.id, occ.start) in claimed:
                continue  # a stored row already speaks for this slot
            if not (since <= occ.start <= until):
                continue
            out.append(
                Occurrence(
                    moment_id=None,
                    rule_id=rule.id,
                    occurrence_at=occ.start,
                    start_at=occ.start,
                    end_at=occ.end,
                    title=rule.activity or rule.name,
                    kind=rule.kind,
                    links=rule_links[rule.id],
                )
            )

    out.sort(key=lambda o: o.start_at)
    return out
