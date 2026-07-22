"""Generic async CRUD router factory.

Given a SQLAlchemy model and its create/read/update schemas, produces the five
standard endpoints (create/list/get/patch/delete). Feature routers compose one
of these per resource and add anything extra on top.
"""

from typing import Any
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, Request, Response, status
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from wild_life.db.session import get_session
from wild_life.query import apply_query


def crud_router(
    *,
    prefix: str,
    tag: str,
    model: type[Any],
    create_schema: type[Any],
    read_schema: type[Any],
    update_schema: type[Any],
    order_by: Any | None = None,
) -> APIRouter:
    """Build a router exposing standard CRUD for ``model``."""
    router = APIRouter(prefix=prefix, tags=[tag])

    # Stable, readable operation ids (e.g. ``/health-events`` -> ``health_events``)
    # so the generated OpenAPI — and the MCP tools derived from it — read as
    # ``health_events_create`` rather than ``create_health_events_post``.
    base = prefix.strip("/").replace("-", "_") or tag.lower().replace(" ", "_")

    @router.post(
        "",
        response_model=read_schema,
        status_code=status.HTTP_201_CREATED,
        operation_id=f"{base}_create",
    )
    async def create(
        payload: create_schema,  # type: ignore[valid-type]
        session: AsyncSession = Depends(get_session),
    ) -> Any:
        obj = model(**payload.model_dump())
        session.add(obj)
        await session.flush()
        await session.refresh(obj)
        return obj

    @router.get("", response_model=list[read_schema], operation_id=f"{base}_list")
    async def list_all(
        request: Request,
        response: Response,
        session: AsyncSession = Depends(get_session),
    ) -> Any:
        stmt = select(model)
        if order_by is not None:
            stmt = stmt.order_by(order_by)
        stmt, limit, offset = apply_query(stmt, model, request.query_params)
        if limit is not None or offset is not None:
            total = await session.scalar(
                select(func.count()).select_from(stmt.order_by(None).subquery())
            )
            response.headers["X-Total-Count"] = str(total or 0)
            if offset is not None:
                stmt = stmt.offset(offset)
            if limit is not None:
                stmt = stmt.limit(limit)
        result = await session.execute(stmt)
        return result.scalars().all()

    @router.get("/{item_id}", response_model=read_schema, operation_id=f"{base}_get")
    async def get_one(
        item_id: UUID, session: AsyncSession = Depends(get_session)
    ) -> Any:
        obj = await session.get(model, item_id)
        if obj is None:
            raise HTTPException(status.HTTP_404_NOT_FOUND, detail="Not found")
        return obj

    @router.patch(
        "/{item_id}", response_model=read_schema, operation_id=f"{base}_update"
    )
    async def update(
        item_id: UUID,
        payload: update_schema,  # type: ignore[valid-type]
        session: AsyncSession = Depends(get_session),
    ) -> Any:
        obj = await session.get(model, item_id)
        if obj is None:
            raise HTTPException(status.HTTP_404_NOT_FOUND, detail="Not found")
        for field, value in payload.model_dump(exclude_unset=True).items():
            setattr(obj, field, value)
        await session.flush()
        await session.refresh(obj)
        return obj

    @router.delete(
        "/{item_id}",
        status_code=status.HTTP_204_NO_CONTENT,
        operation_id=f"{base}_delete",
    )
    async def delete(
        item_id: UUID, session: AsyncSession = Depends(get_session)
    ) -> None:
        obj = await session.get(model, item_id)
        if obj is None:
            raise HTTPException(status.HTTP_404_NOT_FOUND, detail="Not found")
        await session.delete(obj)

    return router
