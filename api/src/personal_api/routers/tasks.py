"""Task routes: personal/delegated queues + recurrence bookkeeping."""

import calendar as _cal
from datetime import date, datetime, timedelta, timezone
from typing import Literal
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from personal_api.db.session import get_session
from personal_api.models.tasks import Task
from personal_api.schemas.common import Priority, TaskStatus
from personal_api.schemas.tasks import TaskCreate, TaskRead, TaskUpdate

router = APIRouter(prefix="/tasks", tags=["tasks"])

_PRIORITY_ORDER = {"urgent": 0, "high": 1, "medium": 2, "low": 3}
# Statuses that represent delegated (not personal-execution) work.
_DELEGATED_STATUSES = {"delegated", "delivered"}
_CLOSED_STATUSES = {"completed", "cancelled"}


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


@router.post("", response_model=TaskRead, status_code=status.HTTP_201_CREATED)
async def create_task(
    payload: TaskCreate, session: AsyncSession = Depends(get_session)
) -> Task:
    task = Task(**payload.model_dump())
    _sync_completion(task)
    session.add(task)
    await session.flush()
    await session.refresh(task)
    return task


@router.get("", response_model=list[TaskRead])
async def list_tasks(
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

    result = await session.execute(stmt)
    items = list(result.scalars().all())
    items.sort(
        key=lambda t: (
            _PRIORITY_ORDER.get(t.priority, 99),
            t.due_date or date.max,
        )
    )
    return items


@router.get("/{item_id}", response_model=TaskRead)
async def get_task(item_id: UUID, session: AsyncSession = Depends(get_session)) -> Task:
    task = await session.get(Task, item_id)
    if task is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, detail="Not found")
    return task


@router.patch("/{item_id}", response_model=TaskRead)
async def update_task(
    item_id: UUID, payload: TaskUpdate, session: AsyncSession = Depends(get_session)
) -> Task:
    task = await session.get(Task, item_id)
    if task is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, detail="Not found")
    was_completed = task.status == "completed"
    for field, value in payload.model_dump(exclude_unset=True).items():
        setattr(task, field, value)
    _sync_completion(task)
    # Newly completed + recurring -> reveal the next occurrence.
    if task.status == "completed" and not was_completed:
        nxt = _spawn_next_occurrence(task)
        if nxt is not None:
            session.add(nxt)
    await session.flush()
    await session.refresh(task)
    return task


@router.delete("/{item_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_task(
    item_id: UUID, session: AsyncSession = Depends(get_session)
) -> None:
    task = await session.get(Task, item_id)
    if task is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, detail="Not found")
    await session.delete(task)
