"""Routes for metrics + entries."""

from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from wild_life.db.session import get_session
from wild_life.derivations import DERIVATIONS, series_for
from wild_life.models.metrics import Metric, MetricEntry
from wild_life.routers.crud import crud_router
from wild_life.schemas.metrics import (
    DerivationInfo,
    MetricCreate,
    MetricEntryCreate,
    MetricEntryRead,
    MetricEntryUpdate,
    MetricRead,
    MetricUpdate,
    SeriesPoint,
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

catalog = APIRouter(tags=["metrics"])


@catalog.get("/derivations", response_model=list[DerivationInfo])
async def list_derivations() -> list[dict]:
    """The computations a derived metric can name, for a picker to offer."""
    return [
        {
            "key": d.key,
            "label": d.label,
            "unit": d.unit,
            "description": d.description,
        }
        for d in DERIVATIONS.values()
    ]


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


@nested.get("/{metric_id}/series", response_model=list[SeriesPoint])
async def metric_series(
    metric_id: UUID, session: AsyncSession = Depends(get_session)
) -> list[dict]:
    """The readings, however they arise.

    One endpoint for both kinds, because nothing downstream — a sparkline, an
    outcome's verdict — should care whether a number was typed in or computed.
    That's the point of deriving: the reading is a reading.
    """
    metric = await session.get(Metric, metric_id)
    if metric is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, detail="Metric not found")
    if metric.source == "derived":
        return [
            {"recorded_at": p.recorded_at, "value": p.value}
            for p in await series_for(session, metric)
        ]
    rows = (
        (
            await session.execute(
                select(MetricEntry)
                .where(MetricEntry.metric_id == metric_id)
                .order_by(MetricEntry.recorded_at.asc())
            )
        )
        .scalars()
        .all()
    )
    return [{"recorded_at": e.recorded_at, "value": e.value} for e in rows]


router.include_router(catalog)
router.include_router(nested)
