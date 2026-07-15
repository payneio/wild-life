"""Routes for goals, goal<->project links, and computed progress."""

from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from personal_api.db.session import get_session
from personal_api.models.core import Project
from personal_api.models.goals import Goal, GoalProject
from personal_api.models.metrics import MetricEntry
from personal_api.routers.crud import crud_router
from personal_api.schemas.core import ProjectRead
from personal_api.schemas.goals import GoalCreate, GoalRead, GoalUpdate

router = APIRouter()

router.include_router(
    crud_router(
        prefix="/goals",
        tag="goals",
        model=Goal,
        create_schema=GoalCreate,
        read_schema=GoalRead,
        update_schema=GoalUpdate,
        order_by=Goal.created_at.desc(),
    )
)

links = APIRouter(prefix="/goals", tags=["goals"])


async def _get_goal(session: AsyncSession, goal_id: UUID) -> Goal:
    goal = await session.get(Goal, goal_id)
    if goal is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, detail="Goal not found")
    return goal


@links.get("/{goal_id}/projects", response_model=list[ProjectRead])
async def list_goal_projects(
    goal_id: UUID, session: AsyncSession = Depends(get_session)
) -> list[Project]:
    await _get_goal(session, goal_id)
    result = await session.execute(
        select(Project)
        .join(GoalProject, GoalProject.project_id == Project.id)
        .where(GoalProject.goal_id == goal_id)
    )
    return list(result.scalars().all())


@links.post("/{goal_id}/projects/{project_id}", status_code=status.HTTP_204_NO_CONTENT)
async def link_goal_project(
    goal_id: UUID, project_id: UUID, session: AsyncSession = Depends(get_session)
) -> None:
    await _get_goal(session, goal_id)
    if await session.get(Project, project_id) is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, detail="Project not found")
    if await session.get(GoalProject, {"goal_id": goal_id, "project_id": project_id}):
        return
    session.add(GoalProject(goal_id=goal_id, project_id=project_id))


@links.delete(
    "/{goal_id}/projects/{project_id}", status_code=status.HTTP_204_NO_CONTENT
)
async def unlink_goal_project(
    goal_id: UUID, project_id: UUID, session: AsyncSession = Depends(get_session)
) -> None:
    link = await session.get(
        GoalProject, {"goal_id": goal_id, "project_id": project_id}
    )
    if link is not None:
        await session.delete(link)


@links.get("/{goal_id}/computed-progress")
async def goal_computed_progress(
    goal_id: UUID, session: AsyncSession = Depends(get_session)
) -> dict:
    """Progress from manual entry, linked-project completion, and latest metric."""
    goal = await _get_goal(session, goal_id)

    # Fraction of linked projects that are completed.
    totals = await session.execute(
        select(
            func.count(Project.id),
            func.count(Project.id).filter(Project.status == "completed"),
        )
        .join(GoalProject, GoalProject.project_id == Project.id)
        .where(GoalProject.goal_id == goal_id)
    )
    total, done = totals.one()
    from_projects = round(100.0 * done / total, 1) if total else None

    from_metric = None
    if goal.metric_id is not None:
        latest = await session.execute(
            select(MetricEntry.value)
            .where(MetricEntry.metric_id == goal.metric_id)
            .order_by(MetricEntry.entry_date.desc())
            .limit(1)
        )
        from_metric = latest.scalar_one_or_none()

    return {
        "manual": goal.progress,
        "from_projects": from_projects,
        "linked_projects": total,
        "completed_projects": done,
        "latest_metric_value": from_metric,
    }


router.include_router(links)
