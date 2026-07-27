"""Where a task sits among its siblings.

A fractional index: each task holds a float, siblings sort by it, and moving one
writes a single row — its new position is the midpoint of the two it lands
between. No renumbering, no cascade.

Midpoints halve the gap every time, so a list reordered into the same slot often
enough runs out of float to split. `rebalance` respaces that sibling set back to
even gaps. It is the slow path and it is rare; correctness lives here rather than
in the client, which cannot see the whole sibling set or take a lock.
"""

from __future__ import annotations

import uuid
from typing import Any

from sqlalchemy import and_, func, select
from sqlalchemy.ext.asyncio import AsyncSession

from wild_life.models.tasks import Task

# Siblings start this far apart, so early reorders are plain midpoints.
GAP = 1024.0
# Closer than this and the midpoint stops being reliably distinct from its
# neighbours in float64. Far above the actual epsilon, deliberately: respacing
# early is cheap and the alternative is two rows silently sharing a position.
MIN_GAP = 1e-6


def siblings_of(task: Task) -> Any:
    """WHERE clause matching the tasks ranked alongside this one.

    Siblings are the rows under the same parent — and for an unfiled task, the
    other unfiled ones. A task carries exactly one parent, so this is a single
    comparison rather than a guess about which of three columns to trust.
    """
    if task.project_id is not None:
        return Task.project_id == task.project_id
    if task.program_id is not None:
        return Task.program_id == task.program_id
    if task.area_id is not None:
        return Task.area_id == task.area_id
    return and_(
        Task.project_id.is_(None),
        Task.program_id.is_(None),
        Task.area_id.is_(None),
    )


async def end_position(session: AsyncSession, task: Task) -> float:
    """A position past every sibling — where a newly captured task belongs.

    Last, not first: capture runs in bursts, and dropping each new task at the
    top would both reverse the burst and shove it through whatever you had
    already arranged.
    """
    highest = await session.scalar(
        select(func.max(Task.position)).where(siblings_of(task))
    )
    return (highest or 0.0) + GAP


async def rebalance(session: AsyncSession, task: Task) -> None:
    """Respace a sibling set to even gaps, preserving its current order."""
    rows = (
        (
            await session.execute(
                select(Task).where(siblings_of(task)).order_by(Task.position.asc())
            )
        )
        .scalars()
        .all()
    )
    for i, row in enumerate(rows, start=1):
        row.position = i * GAP
    await session.flush()


async def position_between(
    session: AsyncSession,
    task: Task,
    after_id: uuid.UUID | None,
    before_id: uuid.UUID | None,
) -> float:
    """The position that puts `task` after one sibling and before another.

    Either anchor may be absent — dropping at the top of a list has nothing
    above it. With neither, the task goes last, which is what an unanchored move
    means for a list you are appending to.
    """
    after = await session.get(Task, after_id) if after_id else None
    before = await session.get(Task, before_id) if before_id else None

    lo = after.position if after is not None else None
    hi = before.position if before is not None else None

    if lo is None and hi is None:
        return await end_position(session, task)
    if lo is None:
        return hi - GAP  # type: ignore[operator]
    if hi is None:
        return lo + GAP

    # Anchors given in the wrong order mean the caller's view of the list is
    # stale. Respacing and retrying would guess; landing it after `after` is the
    # half of the request that is unambiguous.
    if hi <= lo:
        return lo + GAP

    if hi - lo < MIN_GAP:
        # Both anchors exist on this branch — `lo`/`hi` came from them.
        assert after is not None and before is not None
        await rebalance(session, task)
        await session.refresh(after)
        await session.refresh(before)
        lo, hi = after.position, before.position

    return (lo + hi) / 2.0
