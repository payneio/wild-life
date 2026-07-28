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
from datetime import UTC, datetime, timedelta
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, Query
from pydantic import BaseModel
from typing import Literal
from sqlalchemy import delete, or_, select, update
from sqlalchemy.ext.asyncio import AsyncSession

from wild_life.db.session import get_session
from wild_life.models.moments import CalendarRecord, Moment, MomentLink
from wild_life.models.protocols import Protocol
from wild_life.models.routines import Routine, RuleLink
from wild_life.recurrence import expand
from wild_life.rules import project
from wild_life.routers.moments import _reconcile_links as reconcile_links
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
    return await collect(session, since, until, kind, linked_type, linked_id)


async def collect(
    session: AsyncSession,
    since: datetime,
    until: datetime,
    kind: list[MomentKind] | None = None,
    linked_type: str | None = None,
    linked_id: UUID | None = None,
) -> list[Occurrence]:
    """The endpoint's body, callable.

    Anything that needs to know when something happens asks *here*. Reminders
    kept a fourth recurrence expander of its own — after `Routine`'s cadence,
    `Event`'s RRULE and FullCalendar's — which is precisely the duplication this
    migration exists to remove: four answers to one question, and no way to tell
    which was right.
    """
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


# --- writing ---------------------------------------------------------------- #
#
# The scoped edit, re-expressed. `routers/calendar.py` needed ~200 lines for this
# because iCal's model made it bookkeeping: exclude the date from the master,
# create a paired override row, seed its content, re-parent later overrides on a
# split. None of that is here, because an occurrence that changed is simply a
# moment — the exception is a record rather than an absence plus a restatement.


# The edit vocabulary is the calendar's (`start_at`, `end_at`); the columns are
# the moment's (`started_at`, `ended_at`). Mapped in one place because `setattr`
# on a mapped class accepts an unknown name in silence — it sets a plain instance
# attribute, the flush writes nothing, and the response looks right because it is
# rendered from the object that just took the value.
_FIELD = {
    "start_at": "started_at",
    "end_at": "ended_at",
    "all_day": "all_day",
    "title": "title",
    "body": "body",
}


def _apply(moment: Moment, changes: "OccurrenceChanges") -> None:
    for field, value in changes.model_dump(
        exclude_unset=True, exclude={"links"}
    ).items():
        column = _FIELD.get(field)
        if column is not None:
            setattr(moment, column, value)


class OccurrenceChanges(BaseModel):
    """What an edit may set. Absent fields are left alone."""

    start_at: datetime | None = None
    end_at: datetime | None = None
    all_day: bool | None = None
    title: str | None = None
    body: str | None = None
    links: list[MomentLinkRef] | None = None


class OccurrenceEdit(BaseModel):
    scope: Literal["this", "following", "all"]
    # Which series, and which of its slots. A moment id alone means a one-off,
    # where scope is meaningless and ignored.
    rule_id: UUID | None = None
    moment_id: UUID | None = None
    occurrence_at: datetime | None = None
    changes: OccurrenceChanges = OccurrenceChanges()


async def _materialise(
    session: AsyncSession,
    rule: Routine,
    occurrence_at: datetime,
    changes: OccurrenceChanges,
    *,
    withdrawn: bool = False,
) -> Moment:
    """Give one projected slot a row, because something happened to it.

    Idempotent on (rule, slot): editing the same occurrence twice corrects the
    row rather than growing a second one, which the unique index also enforces.
    """
    existing = (
        await session.execute(
            select(Moment).where(
                Moment.rule_id == rule.id, Moment.occurrence_at == occurrence_at
            )
        )
    ).scalar_one_or_none()
    moment = existing or Moment(
        kind=rule.kind,
        rule_id=rule.id,
        occurrence_at=occurrence_at,
        started_at=occurrence_at,
        ended_at=(
            occurrence_at + timedelta(minutes=rule.expected_minutes)
            if rule.expected_minutes
            else None
        ),
        title=rule.activity or rule.name,
        body="",
        source="authored",
    )
    if existing is None:
        session.add(moment)
    _apply(moment, changes)
    if withdrawn:
        moment.withdrawn_at = datetime.now(UTC)
    await session.flush()
    if changes.links is not None:
        await reconcile_links(session, moment.id, changes.links)
    return moment


@router.patch(
    "/occurrences", response_model=Occurrence, operation_id="occurrences_edit"
)
async def edit_occurrence(
    payload: OccurrenceEdit, session: AsyncSession = Depends(get_session)
) -> Occurrence:
    """Edit one occurrence, the following ones, or the whole series."""
    changes = payload.changes

    # A one-off: there is no series, so there is nothing to scope.
    if payload.rule_id is None:
        if payload.moment_id is None:
            raise HTTPException(400, detail="rule_id or moment_id is required")
        moment = await session.get(Moment, payload.moment_id)
        if moment is None:
            raise HTTPException(404, detail="Not found")
        _apply(moment, changes)
        if changes.links is not None:
            await reconcile_links(session, moment.id, changes.links)
        await session.flush()
        await session.refresh(moment)
        links = await _links_for(session, [moment.id])
        return _from_moment(moment, None, links[moment.id])

    rule = await session.get(Routine, payload.rule_id)
    if rule is None:
        raise HTTPException(404, detail="Not found")
    protocol = (
        await session.get(Protocol, rule.protocol_id) if rule.protocol_id else None
    )
    at = payload.occurrence_at

    if payload.scope == "this":
        if at is None:
            raise HTTPException(400, detail="occurrence_at is required for scope=this")
        moment = await _materialise(session, rule, at, changes)
        await session.refresh(moment)
        links = await _links_for(session, [moment.id])
        return _from_moment(moment, None, links[moment.id])

    if payload.scope == "all":
        # The rule *is* the series, so editing it is the whole edit — no walking
        # of override rows, because there are none to walk.
        if changes.title is not None:
            rule.activity = changes.title
        if changes.start_at is not None:
            rule.timing = [
                changes.start_at.astimezone(_zone_of(rule)).strftime("%H:%M")
            ]
            if changes.end_at is not None:
                rule.expected_minutes = int(
                    (changes.end_at - changes.start_at).total_seconds() // 60
                )
        await session.flush()
        return _first_projection(rule, protocol, at)

    # scope == "following": the series splits into two rules, and the second one
    # carries the change. iCal expresses this by rewriting UNTIL on the master and
    # cloning it; the clone here is a rule, not a row per occurrence.
    if at is None:
        raise HTTPException(400, detail="occurrence_at is required for scope=following")
    tail = Routine(
        kind=rule.kind,
        activity=changes.title if changes.title is not None else rule.activity,
        timing=(
            [changes.start_at.astimezone(_zone_of(rule)).strftime("%H:%M")]
            if changes.start_at is not None
            else list(rule.timing or [])
        ),
        days_of_week=list(rule.days_of_week or []),
        interval_days=rule.interval_days,
        timezone=rule.timezone,
        expected_minutes=(
            int((changes.end_at - changes.start_at).total_seconds() // 60)
            if changes.start_at is not None and changes.end_at is not None
            else rule.expected_minutes
        ),
        start_date=at.date(),
        end_date=rule.end_date,
        status=rule.status,
        protocol_id=rule.protocol_id,
        area_id=rule.area_id,
        program_id=rule.program_id,
    )
    session.add(tail)
    await session.flush()
    for link in (
        (await session.execute(select(RuleLink).where(RuleLink.rule_id == rule.id)))
        .scalars()
        .all()
    ):
        session.add(
            RuleLink(
                rule_id=tail.id,
                role=link.role,
                entity_type=link.entity_type,
                entity_id=link.entity_id,
            )
        )
    # The head stops the day before the split.
    rule.end_date = (at - timedelta(days=1)).date()
    # Exceptions at or after the split belong to the tail now.
    await session.execute(
        update(Moment)
        .where(Moment.rule_id == rule.id, Moment.occurrence_at >= at)
        .values(rule_id=tail.id)
    )
    await session.flush()
    return _first_projection(tail, protocol, at)


def _zone_of(rule: Routine):  # noqa: ANN202 - a tzinfo, via the evaluator's rule
    from wild_life.rules import _zone

    return _zone(rule)


def _first_projection(
    rule: Routine, protocol: Protocol | None, at: datetime | None
) -> Occurrence:
    """The series as it now stands, at or after the edited slot."""
    day = (at or datetime.now(UTC)).date()
    found = project(rule, protocol, day, day + timedelta(days=370))
    if found:
        one = found[0]
        return Occurrence(
            rule_id=rule.id,
            occurrence_at=one.start,
            start_at=one.start,
            end_at=one.end,
            title=rule.activity or rule.name,
            kind=rule.kind,
        )
    return Occurrence(
        rule_id=rule.id,
        occurrence_at=at or datetime.now(UTC),
        start_at=at or datetime.now(UTC),
        title=rule.activity or rule.name,
        kind=rule.kind,
    )


@router.delete("/occurrences", status_code=204, operation_id="occurrences_delete")
async def delete_occurrence(
    scope: Literal["this", "following", "all"],
    rule_id: UUID | None = None,
    moment_id: UUID | None = None,
    occurrence_at: datetime | None = None,
    session: AsyncSession = Depends(get_session),
) -> None:
    """Remove one occurrence, the following ones, or the whole series."""
    if rule_id is None:
        if moment_id is None:
            raise HTTPException(400, detail="rule_id or moment_id is required")
        moment = await session.get(Moment, moment_id)
        if moment is None:
            raise HTTPException(404, detail="Not found")
        await session.delete(moment)
        return

    rule = await session.get(Routine, rule_id)
    if rule is None:
        raise HTTPException(404, detail="Not found")

    if scope == "all":
        # Materialised exceptions cascade with it: they exist only as amendments
        # to a series that no longer does.
        await session.delete(rule)
        return

    if occurrence_at is None:
        raise HTTPException(400, detail="occurrence_at is required")

    if scope == "this":
        # Not a deletion — a withdrawal. Abandoning by choice is an act, and
        # worth telling apart from a date quietly passing (decision 14).
        await _materialise(
            session, rule, occurrence_at, OccurrenceChanges(), withdrawn=True
        )
        return

    # "following": stop the rule the day before, and drop exceptions after it.
    rule.end_date = (occurrence_at - timedelta(days=1)).date()
    await session.execute(
        delete(Moment).where(
            Moment.rule_id == rule.id, Moment.occurrence_at >= occurrence_at
        )
    )
