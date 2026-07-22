"""Scope-aware authorization for delegated workers.

Reads are global (handled by the middleware). *Writes* by a worker are limited to
work they own: a task they are assigned/responsible/accountable for, or any task in
an area/program/project they lead or own (ownership cascades down the hierarchy).
The owner (``role='full'``) is never restricted here.
"""

import uuid
from dataclasses import dataclass

from fastapi import HTTPException, status
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from wild_life.identity import Identity
from wild_life.models.core import Area, Program, Project
from wild_life.models.tasks import Task

# Fields a worker may change on a task they own — the "doing the work" surface.
# Notably excludes the RACI person fields and area/program/project (no reassigning
# or moving work out of scope) and owner-set fields like title/priority/due_date.
WORKER_TASK_FIELDS = frozenset(
    {
        "status",
        "notes",
        "description",
        "estimated_minutes",
        "scheduled_date",
        "scheduled_time",
        "context",
        "completed_at",
    }
)


@dataclass(frozen=True)
class OwnedScopes:
    area_ids: set[uuid.UUID]
    program_ids: set[uuid.UUID]
    project_ids: set[uuid.UUID]


async def directly_owned_scopes(
    session: AsyncSession, person_id: uuid.UUID
) -> OwnedScopes:
    """Areas/programs/projects the person leads or owns *directly* (no cascade).

    Used for the actionable-work queue (triage of unassigned work at its tightest
    scope), where a broader owner must not shadow a more-specific one.
    """
    area_ids = set(
        (
            await session.execute(
                select(Area.id).where(
                    (Area.accountable_owner_id == person_id)
                    | (Area.responsible_lead_id == person_id)
                )
            )
        ).scalars()
    )
    program_ids = set(
        (
            await session.execute(
                select(Program.id).where(
                    (Program.accountable_owner_id == person_id)
                    | (Program.responsible_lead_id == person_id)
                )
            )
        ).scalars()
    )
    project_ids = set(
        (
            await session.execute(
                select(Project.id).where(
                    (Project.accountable_owner_id == person_id)
                    | (Project.responsible_lead_id == person_id)
                )
            )
        ).scalars()
    )
    return OwnedScopes(area_ids, program_ids, project_ids)


async def owned_scopes(session: AsyncSession, person_id: uuid.UUID) -> OwnedScopes:
    """Areas/programs/projects the person owns, cascaded downward (write authority)."""
    direct = await directly_owned_scopes(session, person_id)
    area_ids = set(direct.area_ids)
    program_ids = set(direct.program_ids)
    if area_ids:  # programs inside an owned area
        program_ids |= set(
            (
                await session.execute(
                    select(Program.id).where(Program.area_id.in_(area_ids))
                )
            ).scalars()
        )
    project_ids = set(direct.project_ids)
    if area_ids or program_ids:  # projects inside an owned area/program
        clause = []
        if area_ids:
            clause.append(Project.area_id.in_(area_ids))
        if program_ids:
            clause.append(Project.program_id.in_(program_ids))
        cond = clause[0]
        for extra in clause[1:]:
            cond = cond | extra
        project_ids |= set(
            (await session.execute(select(Project.id).where(cond))).scalars()
        )
    return OwnedScopes(area_ids, program_ids, project_ids)


def _task_in_scope(task: Task, person_id: uuid.UUID, scopes: OwnedScopes) -> bool:
    return (
        task.assignee_id == person_id
        or task.responsible_id == person_id
        or task.accountable_owner_id == person_id
        or (task.area_id is not None and task.area_id in scopes.area_ids)
        or (task.program_id is not None and task.program_id in scopes.program_ids)
        or (task.project_id is not None and task.project_id in scopes.project_ids)
    )


def _forbid(detail: str) -> HTTPException:
    return HTTPException(status.HTTP_403_FORBIDDEN, detail=detail)


async def assert_can_write_task(
    session: AsyncSession, task: Task, identity: Identity
) -> None:
    """Reject a worker mutating a task outside the scope they own."""
    if not identity.is_worker:
        return
    if identity.person_id is None:
        raise _forbid("Worker has no Person identity")
    scopes = await owned_scopes(session, identity.person_id)
    if not _task_in_scope(task, identity.person_id, scopes):
        raise _forbid("Task is outside your scope")


async def scope_task_create(
    session: AsyncSession, values: dict, identity: Identity
) -> dict:
    """For a worker: allow assigning within an owned scope, else force self-assign."""
    if not identity.is_worker:
        return values
    if identity.person_id is None:
        raise _forbid("Worker has no Person identity")
    scopes = await owned_scopes(session, identity.person_id)
    area_id = values.get("area_id")
    program_id = values.get("program_id")
    project_id = values.get("project_id")
    in_owned_scope = (
        (area_id is not None and area_id in scopes.area_ids)
        or (program_id is not None and program_id in scopes.program_ids)
        or (project_id is not None and project_id in scopes.project_ids)
    )
    if not in_owned_scope:
        # Outside an owned scope a worker may only create their own work.
        values["assignee_id"] = identity.person_id
    return values


def assert_worker_task_fields(values: dict, identity: Identity) -> None:
    """Reject a worker touching task fields outside the allowed 'doing-work' set."""
    if not identity.is_worker:
        return
    illegal = set(values) - WORKER_TASK_FIELDS
    if illegal:
        raise _forbid(f"Workers may not modify: {', '.join(sorted(illegal))}")
