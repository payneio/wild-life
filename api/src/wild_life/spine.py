"""Writing the spine inline, at the moment the act happens.

The inversion moved *reading* onto moments and left *writing* where it was: a
dose landed in `routine_instances` and became a moment only when the five-minute
tick ran. So the timeline and every record's Log lagged reality for most of what
you do in the app — you logged a dose, opened the medication, and it was not
there yet, with nothing on screen to say why.

This module is the other half. Each function records the moment for one act, in
the same transaction as the row the act wrote, so there is no window in which the
two disagree.

**Idempotent on `source_ref`, which is what makes the cut-over safe.** The
backfill names every derived moment after the row it came from
(`task:<id>:completion`), and `uq_moments_source_ref` enforces one row per name.
Writing inline under the same name means the tick upserts onto what is already
there instead of duplicating it — so the mirror and these calls can run at the
same time, and surfaces can move over one at a time rather than on a flag day.

The mapping rules are the backfill's, deliberately: two writers that disagree
about what a dose becomes would be worse than the lag this removes.
`tests/test_spine.py` pins them against it.
"""

from __future__ import annotations

import uuid
from datetime import date, datetime, time, timezone
from typing import Any, Iterable

from sqlalchemy import delete, select
from sqlalchemy.dialects.postgresql import insert
from sqlalchemy.ext.asyncio import AsyncSession

from wild_life.models.moments import Moment, MomentDose, MomentLink, MomentReading

Edge = tuple[str, str, uuid.UUID]


def instant(d: date | datetime | None) -> datetime | None:
    """A date becomes the instant it starts, in UTC; a datetime passes through.

    The same widening the backfill does. Noon would be the choice for something
    rendered back as a day — see the composer — but a *window* bound is not
    rendered, it is compared, so midnight is the honest edge.
    """
    if d is None:
        return None
    if isinstance(d, datetime):
        return d if d.tzinfo else d.replace(tzinfo=timezone.utc)
    return datetime.combine(d, time.min, tzinfo=timezone.utc)


async def upsert_moment(
    session: AsyncSession,
    source_ref: str,
    *,
    kind: str,
    started_at: datetime | None = None,
    ended_at: datetime | None = None,
    all_day: bool = False,
    window_start: datetime | None = None,
    window_end: datetime | None = None,
    expected_minutes: int | None = None,
    title: str | None = None,
    body: str = "",
    source: str = "authored",
) -> uuid.UUID:
    """Upsert the moment named by `source_ref`, returning its id.

    No `changed_at` guard here, unlike the backfill's. That guard exists because
    a *mirror* replaying old rows could revert an edit made since; a writer
    running inside the act's own transaction is never stale by construction.
    """
    values: dict[str, Any] = {
        "kind": kind,
        "started_at": started_at,
        "ended_at": ended_at,
        "all_day": all_day,
        "window_start": window_start,
        "window_end": window_end,
        "expected_minutes": expected_minutes,
        "title": title,
        "body": body,
        "source": source,
        "source_ref": source_ref,
    }
    stmt = (
        insert(Moment)
        .values(**values)
        .on_conflict_do_update(
            index_elements=[Moment.source_ref],
            set_={k: v for k, v in values.items() if k != "source_ref"},
        )
        .returning(Moment.id)
    )
    return (await session.execute(stmt)).scalar_one()


async def set_links(
    session: AsyncSession, moment_id: uuid.UUID, edges: Iterable[Edge]
) -> list[uuid.UUID]:
    """Replace a moment's links, returning the new link ids in order.

    Wholesale replacement rather than a merge, for the reason the backfill gives:
    a partial update leaves edges from a previous shape of the row behind, and an
    edge nobody can account for is worse than one rewritten needlessly.
    """
    await session.execute(delete(MomentLink).where(MomentLink.moment_id == moment_id))
    ids: list[uuid.UUID] = []
    for role, entity_type, entity_id in edges:
        if entity_id is None:
            continue
        got = await session.execute(
            insert(MomentLink)
            .values(
                moment_id=moment_id,
                role=role,
                entity_type=entity_type,
                entity_id=entity_id,
            )
            .on_conflict_do_update(
                constraint="uq_moment_links_edge", set_={"role": role}
            )
            .returning(MomentLink.id)
        )
        ids.append(got.scalar_one())
    return ids


async def forget(session: AsyncSession, *source_refs: str) -> None:
    """Drop the moments named by these refs.

    Deleting the row an act was derived from should take its moment with it;
    otherwise the timeline keeps asserting something that no longer happened.
    """
    if source_refs:
        await session.execute(delete(Moment).where(Moment.source_ref.in_(source_refs)))


# --- one function per act ---------------------------------------------------


async def record_task(session: AsyncSession, task: Any) -> None:
    """A task's completion, and its intention to work on it.

    Two moments, not one: finishing is an occurrence and being scheduled for
    Tuesday is an intention with a window. Either may vanish — reopening a task
    clears `completed_at`, unscheduling clears the window — so the absent case
    deletes rather than leaving a moment asserting a finish that was undone.
    """
    if task.completed_at is not None:
        mid = await upsert_moment(
            session,
            f"task:{task.id}:completion",
            kind="completion",
            started_at=task.completed_at,
            title=task.title,
        )
        await set_links(session, mid, [("subject", "task", task.id)])
    else:
        await forget(session, f"task:{task.id}:completion")

    if task.scheduled_date is not None:
        timed = getattr(task, "scheduled_time", None)
        if timed is not None:
            start = datetime.combine(task.scheduled_date, timed, tzinfo=timezone.utc)
            minutes = task.estimated_minutes or 60
        else:
            start = instant(task.scheduled_date)
            minutes = task.estimated_minutes
        mid = await upsert_moment(
            session,
            f"task:{task.id}:work",
            kind="work",
            all_day=timed is None,
            window_start=start,
            window_end=start,
            expected_minutes=minutes,
            title=task.title,
        )
        await set_links(session, mid, [("subject", "task", task.id)])
    else:
        await forget(session, f"task:{task.id}:work")


async def record_routine_instance(
    session: AsyncSession, inst: Any, routine: Any
) -> None:
    """A logged protocol step: a dose if it names a medication, else an activity.

    The medication may be on the instance or on the rule it fulfils, and only the
    first was counted once before — hence reading both. `scheduled_date` is the
    intention and `completed_at` the occurrence, which is the shape the rest of
    the spine has; a skipped step keeps the window and has no occurrence.
    """
    med = inst.medication_id or (routine.medication_id if routine else None)
    kind = "dose" if med else "activity"
    window = instant(inst.scheduled_date)
    mid = await upsert_moment(
        session,
        f"routine_instance:{inst.id}",
        kind=kind,
        started_at=inst.completed_at,
        all_day=inst.completed_at is None,
        window_start=window,
        window_end=window,
        title=routine.activity if routine else None,
    )
    edges: list[Edge] = []
    if med:
        edges.append(("subject", "medication", med))
    elif inst.routine_id:
        edges.append(("subject", "routine", inst.routine_id))
    link_ids = await set_links(session, mid, edges)

    if med and link_ids:
        # The amount belongs to the *pairing*, not the moment: one act can take
        # two medications, and each has its own dose.
        await session.execute(
            insert(MomentDose)
            .values(link_id=link_ids[0], amount=inst.amount, unit=inst.unit)
            .on_conflict_do_update(
                index_elements=[MomentDose.link_id],
                set_={"amount": inst.amount, "unit": inst.unit},
            )
        )


async def record_reading(
    session: AsyncSession,
    *,
    reading_id: uuid.UUID,
    recorded_at: datetime,
    context: str | None,
    values: list[tuple[uuid.UUID, float]],
) -> uuid.UUID:
    """One act of measuring: one moment, N metrics, N values.

    A panel is a single occasion with five results, not five occasions, which is
    why the value keys on the link. `values` is `(metric_id, value)` in the order
    the form asked, and the links are rewritten wholesale — so correcting one
    number in a panel cannot silently drop the other four.
    """
    mid = await upsert_moment(
        session,
        f"group_reading:{reading_id}",
        kind="measurement",
        started_at=recorded_at,
        body=context or "",
    )
    edges: list[Edge] = [("subject", "metric", metric_id) for metric_id, _ in values]
    link_ids = await set_links(session, mid, edges)
    for link_id, (_, value) in zip(link_ids, values):
        await session.execute(
            insert(MomentReading)
            .values(link_id=link_id, value=value)
            .on_conflict_do_update(
                index_elements=[MomentReading.link_id], set_={"value": value}
            )
        )
    return mid


async def record_metric_entry(session: AsyncSession, entry: Any) -> None:
    """A standalone entry is its own act; one inside a panel belongs to it.

    An entry with a `group_reading_id` is recorded by :func:`record_reading` for
    the whole panel, so recording it again here would make a second moment for a
    value that already has one.
    """
    if getattr(entry, "group_reading_id", None) is not None:
        return
    mid = await upsert_moment(
        session,
        f"metric_entry:{entry.id}",
        kind="measurement",
        started_at=instant(entry.recorded_at),
        body=getattr(entry, "context", None) or "",
    )
    link_ids = await set_links(session, mid, [("subject", "metric", entry.metric_id)])
    if link_ids:
        await session.execute(
            insert(MomentReading)
            .values(link_id=link_ids[0], value=entry.value)
            .on_conflict_do_update(
                index_elements=[MomentReading.link_id], set_={"value": entry.value}
            )
        )


# The remaining names for "the moment this finished", plus decisions. Each is a
# date column on a standing thing; the act is what the column means, not what
# the table is called.
FINISHES: dict[str, tuple[str, str, str]] = {
    # entity_type: (date attribute, label attribute, kind)
    "request": ("resolved_at", "subject", "completion"),
    "outcome": ("satisfied_at", "statement", "completion"),
    "review": ("completed_at", "review_type", "completion"),
    "decision": ("decided_on", "question", "decision"),
    "allergy": ("noted_on", "substance", "observation"),
    "commitment": ("date_made", "description", "exchange"),
}


async def record_finish(session: AsyncSession, entity_type: str, row: Any) -> None:
    """The completion/decision moment for a standing thing's date column."""
    spec = FINISHES.get(entity_type)
    if spec is None:
        return
    attr, label_attr, kind = spec
    when = getattr(row, attr, None)
    ref = f"{entity_type}:{row.id}:{kind}"
    if when is None:
        await forget(session, ref)
        return
    label = getattr(row, label_attr, None)
    mid = await upsert_moment(
        session,
        ref,
        kind=kind,
        started_at=instant(when),
        all_day=not isinstance(when, datetime),
        title=str(label)[:200] if label else None,
    )
    await set_links(session, mid, [("subject", entity_type, row.id)])


async def record_visit(session: AsyncSession, visit: Any) -> None:
    """A stretch of time inside a place, as the geofence saw it."""
    mid = await upsert_moment(
        session,
        f"location_visit:{visit.id}",
        kind="visit",
        started_at=visit.entered_at,
        ended_at=visit.exited_at,
        source="derived",
    )
    await set_links(session, mid, [("place", "location", visit.location_id)])


async def forget_for(
    session: AsyncSession, entity_type: str, row_id: uuid.UUID
) -> None:
    """Every moment derived from a row that is being deleted."""
    refs = [
        f"task:{row_id}:completion",
        f"task:{row_id}:work",
        f"routine_instance:{row_id}",
        f"metric_entry:{row_id}",
        f"group_reading:{row_id}",
        f"location_visit:{row_id}",
    ]
    spec = FINISHES.get(entity_type)
    if spec is not None:
        refs.append(f"{entity_type}:{row_id}:{spec[2]}")
    await forget(session, *refs)


async def moment_for(session: AsyncSession, source_ref: str) -> Moment | None:
    """The moment a given row produced, if it has one. For tests and triage."""
    return (
        await session.execute(select(Moment).where(Moment.source_ref == source_ref))
    ).scalar_one_or_none()
