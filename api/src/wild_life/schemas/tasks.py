"""Schemas for Task."""

import uuid
from datetime import date, datetime, time

from typing import Literal

from pydantic import BaseModel

from wild_life.schemas.common import EndingCause, EntityType, Entity, Priority, TaskStatus


class TaskCreate(BaseModel):
    # The act this commitment came out of, if it came out of one — a meeting
    # that produced two follow-ups, a conversation that left you owing
    # something. Writes the `generates` edge (A4). Not stored on the task: the
    # relation is M:N and lives in `intention_moments`.
    generated_by_moment_id: uuid.UUID | None = None
    title: str
    description: str | None = None
    status: TaskStatus = "inbox"
    # Stored as one scope reference; accepted either way. A client saying
    # `project_id` is saying the natural thing, and `_file_under_one_parent`
    # folds it into the pair below.
    area_id: uuid.UUID | None = None
    program_id: uuid.UUID | None = None
    project_id: uuid.UUID | None = None
    scope_type: EntityType | None = None
    scope_id: uuid.UUID | None = None
    priority: Priority = "medium"
    accountable_owner_id: uuid.UUID | None = None
    responsible_id: uuid.UUID | None = None
    assignee_id: uuid.UUID | None = None
    due_date: date | None = None
    scheduled_date: date | None = None
    scheduled_time: time | None = None
    estimated_minutes: int | None = None
    recurrence: str | None = None
    blocked_by_task_id: uuid.UUID | None = None
    waiting_on: str | None = None
    acceptance_required: bool = False
    # Absent means "rank me last"; the router fills it in.
    position: float | None = None
    # Allow backdating on create/import; _sync_completion leaves a provided value untouched.
    completed_at: datetime | None = None
    ending_cause: EndingCause | None = None
    ending_note: str | None = None


class TaskMove(BaseModel):
    """Drop a task between two of its siblings, and optionally restatus it.

    Anchors rather than a number: the client knows what it dropped the row
    between, not what float that implies, and computing the float here keeps two
    writers from picking the same one. Both absent means "put it last".

    `status` rides along because dragging a row from To do into In progress is
    one gesture and should be one write — two requests would render an
    intermediate state that the user never asked for.
    """

    after_id: uuid.UUID | None = None
    before_id: uuid.UUID | None = None
    status: TaskStatus | None = None


class TaskUpdate(BaseModel):
    ending_cause: EndingCause | None = None
    ending_note: str | None = None
    title: str | None = None
    description: str | None = None
    status: TaskStatus | None = None
    # Stored as one scope reference; accepted either way. A client saying
    # `project_id` is saying the natural thing, and `_file_under_one_parent`
    # folds it into the pair below.
    area_id: uuid.UUID | None = None
    program_id: uuid.UUID | None = None
    project_id: uuid.UUID | None = None
    scope_type: EntityType | None = None
    scope_id: uuid.UUID | None = None
    priority: Priority | None = None
    accountable_owner_id: uuid.UUID | None = None
    responsible_id: uuid.UUID | None = None
    assignee_id: uuid.UUID | None = None
    due_date: date | None = None
    scheduled_date: date | None = None
    scheduled_time: time | None = None
    estimated_minutes: int | None = None
    recurrence: str | None = None
    blocked_by_task_id: uuid.UUID | None = None
    waiting_on: str | None = None
    acceptance_required: bool | None = None
    # Reordering normally goes through /move, which computes this from the
    # neighbours. Exposed here for an importer that already knows the number.
    position: float | None = None


class TaskRead(Entity):
    title: str
    description: str | None
    status: TaskStatus
    scope_type: EntityType | None
    scope_id: uuid.UUID | None
    priority: Priority
    accountable_owner_id: uuid.UUID | None
    responsible_id: uuid.UUID | None
    assignee_id: uuid.UUID | None
    due_date: date | None
    scheduled_date: date | None
    scheduled_time: time | None
    estimated_minutes: int | None
    recurrence: str | None
    blocked_by_task_id: uuid.UUID | None
    waiting_on: str | None
    acceptance_required: bool
    position: float
    completed_at: datetime | None
    ending_cause: EndingCause | None
    ending_note: str | None
    claimed_by_id: uuid.UUID | None = None
    claimed_at: datetime | None = None


class AssignmentEvent(BaseModel):
    """A change in who is *responsible*, never in who is accountable.

    `offered`/`accepted` put responsibility on someone; `declined`/`withdrawn`
    return it. The commitment is untouched either way — A7.
    """

    event: Literal["offered", "accepted", "declined", "withdrawn"]
    person_id: uuid.UUID | None = None
    note: str | None = None
