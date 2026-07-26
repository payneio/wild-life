"""Routes for metrics + entries."""

from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from wild_life.db.session import get_session
from wild_life.models.metrics import Metric, MetricEntry
from wild_life.routers.crud import crud_router
from wild_life.schemas.metrics import (
    MetricCreate,
    MetricEntryCreate,
    MetricEntryRead,
    MetricEntryUpdate,
    MetricRead,
    MetricUpdate,
)

router = APIRouter()

router.include_router(
    crud_router(
        prefix="/metrics",
        tag="metrics",
        model=Metric,
        create_schema=MetricCreate,
        read_schema=MetricRead,
        update_schema=MetricUpdate,
        order_by=Metric.name,
    )
)
router.include_router(
    crud_router(
        prefix="/metric-entries",
        tag="metrics",
        model=MetricEntry,
        create_schema=MetricEntryCreate,
        read_schema=MetricEntryRead,
        update_schema=MetricEntryUpdate,
        order_by=MetricEntry.recorded_at.desc(),
    )
)

nested = APIRouter(prefix="/metrics", tags=["metrics"])


@nested.get("/{metric_id}/entries", response_model=list[MetricEntryRead])
async def list_metric_entries(
    metric_id: UUID, session: AsyncSession = Depends(get_session)
) -> list[MetricEntry]:
    metric = await session.get(Metric, metric_id)
    if metric is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, detail="Metric not found")
    result = await session.execute(
        select(MetricEntry)
        .where(MetricEntry.metric_id == metric_id)
        .order_by(MetricEntry.recorded_at.asc())
    )
    return list(result.scalars().all())


router.include_router(nested)
