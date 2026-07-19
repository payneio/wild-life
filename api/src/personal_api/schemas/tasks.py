"""Schemas for Task."""

import uuid
from datetime import date, datetime, time

from pydantic import BaseModel

from personal_api.schemas.common import Entity, Priority, TaskStatus


class TaskCreate(BaseModel):
    title: str
    description: str | None = None
    status: TaskStatus = "inbox"
    area_id: uuid.UUID | None = None
    program_id: uuid.UUID | None = None
    project_id: uuid.UUID | None = None
    priority: Priority = "medium"
    accountable_owner_id: uuid.UUID | None = None
    responsible_id: uuid.UUID | None = None
    assignee_id: uuid.UUID | None = None
    due_date: date | None = None
    scheduled_date: date | None = None
    scheduled_time: time | None = None
    estimated_minutes: int | None = None
    context: str | None = None
    recurrence: str | None = None
    blocked_by_task_id: uuid.UUID | None = None
    waiting_on: str | None = None
    acceptance_required: bool = False
    notes: str | None = None
    # Allow backdating on create/import; _sync_completion leaves a provided value untouched.
    completed_at: datetime | None = None


class TaskUpdate(BaseModel):
    title: str | None = None
    description: str | None = None
    status: TaskStatus | None = None
    area_id: uuid.UUID | None = None
    program_id: uuid.UUID | None = None
    project_id: uuid.UUID | None = None
    priority: Priority | None = None
    accountable_owner_id: uuid.UUID | None = None
    responsible_id: uuid.UUID | None = None
    assignee_id: uuid.UUID | None = None
    due_date: date | None = None
    scheduled_date: date | None = None
    scheduled_time: time | None = None
    estimated_minutes: int | None = None
    context: str | None = None
    recurrence: str | None = None
    blocked_by_task_id: uuid.UUID | None = None
    waiting_on: str | None = None
    acceptance_required: bool | None = None
    notes: str | None = None


class TaskRead(Entity):
    title: str
    description: str | None
    status: str
    area_id: uuid.UUID | None
    program_id: uuid.UUID | None
    project_id: uuid.UUID | None
    priority: str
    accountable_owner_id: uuid.UUID | None
    responsible_id: uuid.UUID | None
    assignee_id: uuid.UUID | None
    due_date: date | None
    scheduled_date: date | None
    scheduled_time: time | None
    estimated_minutes: int | None
    context: str | None
    recurrence: str | None
    blocked_by_task_id: uuid.UUID | None
    waiting_on: str | None
    acceptance_required: bool
    notes: str | None
    completed_at: datetime | None
    claimed_by_id: uuid.UUID | None = None
    claimed_at: datetime | None = None
