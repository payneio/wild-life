"""Read-only history feed over the change log."""

from uuid import UUID

from fastapi import APIRouter, Depends, Query
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from wild_life.db.session import get_session
from wild_life.models.history import ChangeLog
from wild_life.schemas.history import ChangeLogRead

router = APIRouter(prefix="/history", tags=["history"])


@router.get("", response_model=list[ChangeLogRead], operation_id="history_list")
async def list_history(
    session: AsyncSession = Depends(get_session),
    entity_type: str | None = None,
    entity_id: UUID | None = None,
    action: str | None = None,
    limit: int = Query(100, ge=1, le=500),
    offset: int = Query(0, ge=0),
) -> list[ChangeLog]:
    """Most-recent-first change feed, optionally filtered by entity or action."""
    stmt = select(ChangeLog).order_by(ChangeLog.created_at.desc())
    if entity_type is not None:
        stmt = stmt.where(ChangeLog.entity_type == entity_type)
    if entity_id is not None:
        stmt = stmt.where(ChangeLog.entity_id == entity_id)
    if action is not None:
        stmt = stmt.where(ChangeLog.action == action)
    stmt = stmt.limit(limit).offset(offset)
    result = await session.execute(stmt)
    return list(result.scalars().all())
