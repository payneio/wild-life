"""Routes for reviews + the review dashboard (neglect/drift detection)."""

from datetime import date, timedelta
from typing import Any

from fastapi import APIRouter, Depends
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from personal_api.db.session import get_session
from personal_api.identity import Identity, current_identity
from personal_api.models.core import Area, Program, Project
from personal_api.models.requests import Request
from personal_api.models.tasks import Task
from personal_api.models.tracking import Delegation
from personal_api.routers.crud import crud_router
from personal_api.schemas.reviews import ReviewCreate, ReviewRead, ReviewUpdate
from personal_api.models.reviews import Review

router = APIRouter()

router.include_router(
    crud_router(
        prefix="/reviews",
        tag="reviews",
        model=Review,
        create_schema=ReviewCreate,
        read_schema=ReviewRead,
        update_schema=ReviewUpdate,
        order_by=Review.created_at.desc(),
    )
)

STALE_DAYS = 14

_TASK_OPEN = ("completed", "cancelled")
_DELEGATION_CLOSED = (
    "delivered",
    "accepted_as_complete",
    "declined",
    "reassigned",
    "cancelled",
)

# Distinct path (not /reviews/...) to avoid colliding with /reviews/{item_id}.
dashboard = APIRouter(tags=["reviews"])


async def _rows(session: AsyncSession, stmt: Any) -> list[Any]:
    return list((await session.execute(stmt)).scalars().all())


@dashboard.get("/review-dashboard", operation_id="review_dashboard")
async def review_dashboard(
    session: AsyncSession = Depends(get_session),
    identity: Identity = Depends(current_identity),
) -> dict:
    """Surface everything a periodic review should catch."""
    today = date.today()
    stale_before = today - timedelta(days=STALE_DAYS)

    def task_row(t: Task) -> dict:
        return {
            "id": str(t.id),
            "title": t.title,
            "status": t.status,
            "priority": t.priority,
            "due_date": t.due_date.isoformat() if t.due_date else None,
            "project_id": str(t.project_id) if t.project_id else None,
            "area_id": str(t.area_id) if t.area_id else None,
        }

    def project_row(p: Project) -> dict:
        return {
            "id": str(p.id),
            "name": p.name,
            "status": p.status,
            "next_action": p.next_action,
            "last_activity_date": p.last_activity_date.isoformat()
            if p.last_activity_date
            else None,
            "accountable_owner_id": str(p.accountable_owner_id)
            if p.accountable_owner_id
            else None,
        }

    def deleg_row(d: Delegation) -> dict:
        return {
            "id": str(d.id),
            "requested_outcome": d.requested_outcome,
            "status": d.status,
            "responsible_id": str(d.responsible_id) if d.responsible_id else None,
            "expected_completion_date": d.expected_completion_date.isoformat()
            if d.expected_completion_date
            else None,
            "follow_up_date": d.follow_up_date.isoformat()
            if d.follow_up_date
            else None,
        }

    # Overdue / due-today tasks (personal, open).
    overdue_tasks = await _rows(
        session,
        select(Task).where(
            Task.due_date < today,
            Task.status.notin_(_TASK_OPEN),
        ),
    )
    due_today = await _rows(
        session,
        select(Task).where(Task.due_date == today, Task.status.notin_(_TASK_OPEN)),
    )

    # Stale / blocked-looking projects.
    stale_projects = await _rows(
        session,
        select(Project).where(
            Project.status == "active",
            (Project.last_activity_date.is_(None))
            | (Project.last_activity_date < stale_before),
        ),
    )
    missing_next_action = await _rows(
        session,
        select(Project).where(
            Project.status == "active",
            (Project.next_action.is_(None)) | (func.length(Project.next_action) == 0),
        ),
    )
    unclear_ownership = await _rows(
        session,
        select(Project).where(
            Project.status.in_(("active", "waiting")),
            Project.accountable_owner_id.is_(None),
        ),
    )

    # Programs active but with no active projects.
    active_project_program_ids = {
        pid
        for (pid,) in (
            await session.execute(
                select(Project.program_id).where(
                    Project.status == "active", Project.program_id.isnot(None)
                )
            )
        ).all()
    }
    inactive_programs = [
        {"id": str(p.id), "name": p.name, "status": p.status}
        for p in await _rows(session, select(Program).where(Program.status == "active"))
        if p.id not in active_project_program_ids
    ]

    # Areas with no active projects and no open tasks.
    areas = await _rows(session, select(Area).where(Area.status == "active"))
    areas_with_projects = {
        pid
        for (pid,) in (
            await session.execute(
                select(Project.area_id).where(
                    Project.status == "active", Project.area_id.isnot(None)
                )
            )
        ).all()
    }
    areas_with_tasks = {
        aid
        for (aid,) in (
            await session.execute(
                select(Task.area_id).where(
                    Task.status.notin_(_TASK_OPEN), Task.area_id.isnot(None)
                )
            )
        ).all()
    }
    neglected_areas = [
        {"id": str(a.id), "name": a.name, "review_frequency": a.review_frequency}
        for a in areas
        if a.id not in areas_with_projects and a.id not in areas_with_tasks
    ]

    # Delegation oversight.
    overdue_delegations = await _rows(
        session,
        select(Delegation).where(
            Delegation.expected_completion_date < today,
            Delegation.status.notin_(_DELEGATION_CLOSED),
        ),
    )
    delegation_followups = await _rows(
        session,
        select(Delegation).where(
            Delegation.follow_up_date <= today,
            Delegation.status.notin_(_DELEGATION_CLOSED),
        ),
    )
    unreviewed_deliverables = await _rows(
        session,
        select(Delegation).where(
            Delegation.status == "delivered",
            Delegation.acceptance_required.is_(True),
        ),
    )

    def request_row(r: Request) -> dict:
        return {
            "id": str(r.id),
            "subject": r.subject,
            "kind": r.kind,
            "requester_id": str(r.requester_id) if r.requester_id else None,
            "addressee_id": str(r.addressee_id) if r.addressee_id else None,
            "needed_by": r.needed_by.isoformat() if r.needed_by else None,
            "follow_up_date": r.follow_up_date.isoformat()
            if r.follow_up_date
            else None,
            "status": r.status,
        }

    # The caller's inbox — open Requests addressed to them (needs their input).
    my_inbox: list[Request] = []
    if identity.person_id is not None:
        my_inbox = await _rows(
            session,
            select(Request).where(
                Request.addressee_id == identity.person_id,
                Request.status == "open",
            ),
        )
    # Oversight: every open Request across all inboxes, regardless of role.
    open_requests = await _rows(
        session, select(Request).where(Request.status == "open")
    )
    # Requests (typically deliverables) past their follow-up date.
    request_followups = await _rows(
        session,
        select(Request).where(
            Request.follow_up_date <= today,
            Request.status == "open",
        ),
    )

    # --- cross-status drift (inconsistency reconciliation queue) -----------
    blocked_task_ids = {
        tid
        for (tid,) in (
            await session.execute(
                select(Request.entity_id).where(
                    Request.entity_type == "task",
                    Request.entity_id.isnot(None),
                    Request.status == "open",
                )
            )
        ).all()
    }
    # Tasks marked 'waiting' with no open Request explaining the block.
    waiting_no_blocker = [
        t
        for t in await _rows(session, select(Task).where(Task.status == "waiting"))
        if t.id not in blocked_task_ids
    ]
    # Tasks 'delegated' with nobody on the hook (no assignee/responsible/accountable).
    delegated_no_owner = await _rows(
        session,
        select(Task).where(
            Task.status == "delegated",
            Task.assignee_id.is_(None),
            Task.responsible_id.is_(None),
            Task.accountable_owner_id.is_(None),
        ),
    )
    # Completed projects that still have open tasks under them.
    open_task_project_ids = {
        pid
        for (pid,) in (
            await session.execute(
                select(Task.project_id).where(
                    Task.status.notin_(_TASK_OPEN), Task.project_id.isnot(None)
                )
            )
        ).all()
    }
    completed_with_open_tasks = [
        p
        for p in await _rows(
            session, select(Project).where(Project.status == "completed")
        )
        if p.id in open_task_project_ids
    ]

    return {
        "generated_for": today.isoformat(),
        "overdue_tasks": [task_row(t) for t in overdue_tasks],
        "due_today": [task_row(t) for t in due_today],
        "stale_projects": [project_row(p) for p in stale_projects],
        "projects_missing_next_action": [project_row(p) for p in missing_next_action],
        "unclear_ownership": [project_row(p) for p in unclear_ownership],
        "inactive_programs": inactive_programs,
        "neglected_areas": neglected_areas,
        "overdue_delegations": [deleg_row(d) for d in overdue_delegations],
        "delegation_followups": [deleg_row(d) for d in delegation_followups],
        "unreviewed_deliverables": [deleg_row(d) for d in unreviewed_deliverables],
        "my_inbox": [request_row(r) for r in my_inbox],
        "open_requests": [request_row(r) for r in open_requests],
        "request_followups": [request_row(r) for r in request_followups],
        "waiting_without_blocker": [task_row(t) for t in waiting_no_blocker],
        "delegated_without_owner": [task_row(t) for t in delegated_no_owner],
        "completed_with_open_tasks": [
            project_row(p) for p in completed_with_open_tasks
        ],
    }


router.include_router(dashboard)
