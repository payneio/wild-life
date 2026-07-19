"""Task routes: personal/delegated queues + recurrence bookkeeping."""

import calendar as _cal
from datetime import date, datetime, timedelta, timezone
from typing import Literal
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, Request, status
from sqlalchemy import or_, select, update
from sqlalchemy.ext.asyncio import AsyncSession

from personal_api.authz import (
    assert_can_write_task,
    assert_worker_task_fields,
    owned_scopes,
    scope_task_create,
)
from personal_api.db.session import get_session
from personal_api.identity import Identity, current_identity
from personal_api.models.tasks import Task
from personal_api.query import apply_query
from personal_api.schemas.common import Priority, TaskStatus
from personal_api.schemas.tasks import TaskCreate, TaskRead, TaskUpdate

router = APIRouter(prefix="/tasks", tags=["tasks"])

_PRIORITY_ORDER = {"urgent": 0, "high": 1, "medium": 2, "low": 3}
# Statuses that represent delegated (not personal-execution) work.
_DELEGATED_STATUSES = {"delegated", "delivered"}
_CLOSED_STATUSES = {"completed", "cancelled"}
# A claim goes stale after this, so a crashed run doesn't wedge a task forever.
_CLAIM_TTL = timedelta(minutes=15)


def _add_months(d: date, months: int) -> date:
    month = d.month - 1 + months
    year = d.year + month // 12
    month = month % 12 + 1
    day = min(d.day, _cal.monthrange(year, month)[1])
    return date(year, month, day)


def _next_date(base: date, recurrence: str) -> date | None:
    r = recurrence.strip().lower()
    mapping = {
        "daily": timedelta(days=1),
        "weekly": timedelta(weeks=1),
        "biweekly": timedelta(weeks=2),
        "fortnightly": timedelta(weeks=2),
    }
    if r in mapping:
        return base + mapping[r]
    if r == "monthly":
        return _add_months(base, 1)
    if r == "quarterly":
        return _add_months(base, 3)
    if r in ("yearly", "annually"):
        return _add_months(base, 12)
    if r.startswith("every ") and r.endswith(" days"):
        try:
            return base + timedelta(days=int(r[6:-5]))
        except ValueError:
            return None
    return None


def _sync_completion(task: Task) -> None:
    if task.status == "completed" and task.completed_at is None:
        task.completed_at = datetime.now(timezone.utc)
    elif task.status != "completed":
        task.completed_at = None


def _spawn_next_occurrence(task: Task) -> Task | None:
    """On completing a recurring task, build its next occurrence."""
    if not task.recurrence:
        return None
    anchor = task.scheduled_date or task.due_date
    if anchor is None:
        return None
    nxt = _next_date(anchor, task.recurrence)
    if nxt is None:
        return None
    shift = (nxt - anchor).days
    return Task(
        title=task.title,
        description=task.description,
        status="planned",
        area_id=task.area_id,
        program_id=task.program_id,
        project_id=task.project_id,
        priority=task.priority,
        accountable_owner_id=task.accountable_owner_id,
        responsible_id=task.responsible_id,
        assignee_id=task.assignee_id,
        scheduled_date=nxt if task.scheduled_date else None,
        due_date=(task.due_date + timedelta(days=shift)) if task.due_date else None,
        estimated_minutes=task.estimated_minutes,
        context=task.context,
        recurrence=task.recurrence,
        acceptance_required=task.acceptance_required,
        notes=task.notes,
    )


@router.post(
    "",
    response_model=TaskRead,
    status_code=status.HTTP_201_CREATED,
    operation_id="tasks_create",
)
async def create_task(
    payload: TaskCreate,
    session: AsyncSession = Depends(get_session),
    identity: Identity = Depends(current_identity),
) -> Task:
    values = await scope_task_create(session, payload.model_dump(), identity)
    task = Task(**values)
    _sync_completion(task)
    session.add(task)
    await session.flush()
    await session.refresh(task)
    return task


@router.get("", response_model=list[TaskRead], operation_id="tasks_list")
async def list_tasks(
    request: Request,
    session: AsyncSession = Depends(get_session),
    queue: Literal["personal", "delegated", "all"] = "all",
    status_filter: TaskStatus | None = None,
    priority: Priority | None = None,
    area_id: UUID | None = None,
    program_id: UUID | None = None,
    project_id: UUID | None = None,
    context: str | None = None,
    include_closed: bool = True,
) -> list[Task]:
    stmt = select(Task)
    if status_filter is not None:
        stmt = stmt.where(Task.status == status_filter)
    if priority is not None:
        stmt = stmt.where(Task.priority == priority)
    if area_id is not None:
        stmt = stmt.where(Task.area_id == area_id)
    if program_id is not None:
        stmt = stmt.where(Task.program_id == program_id)
    if project_id is not None:
        stmt = stmt.where(Task.project_id == project_id)
    if context is not None:
        stmt = stmt.where(Task.context == context)
    if queue == "personal":
        # Personal execution queue excludes delegated work.
        stmt = stmt.where(Task.status.notin_(_DELEGATED_STATUSES | _CLOSED_STATUSES))
    elif queue == "delegated":
        stmt = stmt.where(Task.status.in_(_DELEGATED_STATUSES))
    if not include_closed and queue != "delegated":
        stmt = stmt.where(Task.status.notin_(_CLOSED_STATUSES))

    stmt, limit, offset = apply_query(stmt, Task, request.query_params)
    if offset is not None:
        stmt = stmt.offset(offset)
    if limit is not None:
        stmt = stmt.limit(limit)
    result = await session.execute(stmt)
    items = list(result.scalars().all())
    if "sort" not in request.query_params:
        # default: priority then due date (unless the caller supplied ?sort=)
        items.sort(
            key=lambda t: (
                _PRIORITY_ORDER.get(t.priority, 99),
                t.due_date or date.max,
            )
        )
    return items


@router.get("/mine", response_model=list[TaskRead], operation_id="tasks_mine")
async def my_tasks(
    session: AsyncSession = Depends(get_session),
    identity: Identity = Depends(current_identity),
    include_closed: bool = False,
) -> list[Task]:
    """Tasks the caller owns: assigned/responsible/accountable, or in an owned scope."""
    if identity.person_id is None:
        return []
    pid = identity.person_id
    scopes = await owned_scopes(session, pid)
    conds = [
        Task.assignee_id == pid,
        Task.responsible_id == pid,
        Task.accountable_owner_id == pid,
    ]
    if scopes.area_ids:
        conds.append(Task.area_id.in_(scopes.area_ids))
    if scopes.program_ids:
        conds.append(Task.program_id.in_(scopes.program_ids))
    if scopes.project_ids:
        conds.append(Task.project_id.in_(scopes.project_ids))
    stmt = select(Task).where(or_(*conds))
    if not include_closed:
        stmt = stmt.where(Task.status.notin_(_CLOSED_STATUSES))
    stmt = stmt.order_by(Task.due_date.asc().nulls_last())
    result = await session.execute(stmt)
    return list(result.scalars().all())


@router.get("/{item_id}", response_model=TaskRead, operation_id="tasks_get")
async def get_task(item_id: UUID, session: AsyncSession = Depends(get_session)) -> Task:
    task = await session.get(Task, item_id)
    if task is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, detail="Not found")
    return task


@router.patch("/{item_id}", response_model=TaskRead, operation_id="tasks_update")
async def update_task(
    item_id: UUID,
    payload: TaskUpdate,
    session: AsyncSession = Depends(get_session),
    identity: Identity = Depends(current_identity),
) -> Task:
    task = await session.get(Task, item_id)
    if task is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, detail="Not found")
    await assert_can_write_task(session, task, identity)
    changes = payload.model_dump(exclude_unset=True)
    assert_worker_task_fields(changes, identity)
    was_completed = task.status == "completed"
    for field, value in changes.items():
        setattr(task, field, value)
    _sync_completion(task)
    # Newly completed + recurring -> reveal the next occurrence.
    if task.status == "completed" and not was_completed:
        nxt = _spawn_next_occurrence(task)
        if nxt is not None:
            session.add(nxt)
    # Finished work frees its claim so it isn't held forever.
    if task.status in _CLOSED_STATUSES:
        task.claimed_by_id = None
        task.claimed_at = None
    await session.flush()
    await session.refresh(task)
    return task


@router.post("/{item_id}/claim", response_model=TaskRead, operation_id="tasks_claim")
async def claim_task(
    item_id: UUID,
    session: AsyncSession = Depends(get_session),
    identity: Identity = Depends(current_identity),
) -> Task:
    """Atomically claim a task so exactly one worker/agent works it (409 if taken)."""
    task = await session.get(Task, item_id)
    if task is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, detail="Not found")
    await assert_can_write_task(session, task, identity)
    if identity.person_id is None:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, detail="No person to claim as")
    now = datetime.now(timezone.utc)
    result = await session.execute(
        update(Task)
        .where(
            Task.id == item_id,
            or_(
                Task.claimed_by_id.is_(None),
                Task.claimed_by_id == identity.person_id,
                Task.claimed_at < now - _CLAIM_TTL,
            ),
        )
        .values(claimed_by_id=identity.person_id, claimed_at=now)
    )
    if result.rowcount != 1:
        raise HTTPException(status.HTTP_409_CONFLICT, detail="Already claimed")
    await session.refresh(task)
    return task


@router.post(
    "/{item_id}/release",
    status_code=status.HTTP_204_NO_CONTENT,
    operation_id="tasks_release",
)
async def release_task(
    item_id: UUID,
    session: AsyncSession = Depends(get_session),
    identity: Identity = Depends(current_identity),
) -> None:
    """Release a claim (only your own, or a stale one, unless you're the owner)."""
    task = await session.get(Task, item_id)
    if task is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, detail="Not found")
    await assert_can_write_task(session, task, identity)
    fresh = (
        task.claimed_at is not None
        and task.claimed_at >= datetime.now(timezone.utc) - _CLAIM_TTL
    )
    if (
        identity.is_worker
        and task.claimed_by_id not in (None, identity.person_id)
        and fresh
    ):
        raise HTTPException(status.HTTP_403_FORBIDDEN, detail="Claimed by another")
    task.claimed_by_id = None
    task.claimed_at = None
    await session.flush()


@router.delete(
    "/{item_id}",
    status_code=status.HTTP_204_NO_CONTENT,
    operation_id="tasks_delete",
)
async def delete_task(
    item_id: UUID, session: AsyncSession = Depends(get_session)
) -> None:
    task = await session.get(Task, item_id)
    if task is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, detail="Not found")
    await session.delete(task)
