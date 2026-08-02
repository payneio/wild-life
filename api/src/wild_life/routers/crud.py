"""Generic async CRUD router factory.

Given a SQLAlchemy model and its create/read/update schemas, produces the five
standard endpoints (create/list/get/patch/delete). Feature routers compose one
of these per resource and add anything extra on top.
"""

from collections.abc import Awaitable, Callable, Mapping
from typing import Any
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, Request, Response, status
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from wild_life.db.session import get_session
from wild_life.query import apply_query
from wild_life.record_moments import forget_for


def crud_router(
    *,
    prefix: str,
    tag: str,
    model: type[Any],
    create_schema: type[Any],
    read_schema: type[Any],
    update_schema: type[Any],
    order_by: Any | None = None,
    list_filter: Callable[[Any, Mapping[str, str]], Any] | None = None,
    on_write: Callable[[AsyncSession, Any], Awaitable[None]] | None = None,
    on_delete: Callable[[AsyncSession, UUID], Awaitable[None]] | None = None,
    source_type: str | None = None,
) -> APIRouter:
    """Build a router exposing standard CRUD for ``model``.

    ``list_filter`` narrows the list query by params ``apply_query`` cannot reach
    on its own — a filter that has to join rather than compare a column. It is a
    hook rather than a bespoke router because the alternative, a second ``GET ""``
    shadowing this one, hides the generic behaviour behind a copy of it.

    ``on_write`` records the act as a moment in the *same transaction* as the
    row, so the timeline can never disagree with the table it was derived from.
    It is a hook here rather than a line in each router for the reason the whole
    factory exists: twenty-odd routers that must each remember a step will not
    all remember it, and the one that forgets is invisible until someone notices
    their Log is missing something. ``source_type`` names the type for the
    delete path, so removing a row takes its moments with it — a timeline that
    keeps asserting a finish you undid is worse than one that lags. ``on_delete``
    is for rows whose children carry moments and vanish by cascade.
    """
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
        if on_write is not None:
            await on_write(session, obj)
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
        if list_filter is not None:
            stmt = list_filter(stmt, request.query_params)
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
        if on_write is not None:
            await on_write(session, obj)
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
        if source_type is not None:
            await forget_for(session, source_type, item_id)
        # For rows whose *children* carry moments. A database-level cascade
        # removes those children without any Python running, so a moment about
        # them would survive the thing it was about — a visit to a place that no
        # longer exists still sitting on the timeline.
        if on_delete is not None:
            await on_delete(session, item_id)
        await session.delete(obj)
        # Flushed here, not left to the session's commit-on-success. A delete a
        # foreign key refuses — a program still holding projects — otherwise
        # fails *after* the route has returned, and the caller is told 204 for a
        # row that is still there. Inside the route it reaches the handler and
        # comes back a 409.
        await session.flush()

    return router
