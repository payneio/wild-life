"""Generic async CRUD router factory.

Given a SQLAlchemy model and its create/read/update schemas, produces the five
standard endpoints (create/list/get/patch/delete). Feature routers compose one
of these per resource and add anything extra on top.
"""

from typing import Any
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from personal_api.db.session import get_session


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

    @router.post("", response_model=read_schema, status_code=status.HTTP_201_CREATED)
    async def create(
        payload: create_schema,  # type: ignore[valid-type]
        session: AsyncSession = Depends(get_session),
    ) -> Any:
        obj = model(**payload.model_dump())
        session.add(obj)
        await session.flush()
        await session.refresh(obj)
        return obj

    @router.get("", response_model=list[read_schema])
    async def list_all(session: AsyncSession = Depends(get_session)) -> Any:
        stmt = select(model)
        if order_by is not None:
            stmt = stmt.order_by(order_by)
        result = await session.execute(stmt)
        return result.scalars().all()

    @router.get("/{item_id}", response_model=read_schema)
    async def get_one(
        item_id: UUID, session: AsyncSession = Depends(get_session)
    ) -> Any:
        obj = await session.get(model, item_id)
        if obj is None:
            raise HTTPException(status.HTTP_404_NOT_FOUND, detail="Not found")
        return obj

    @router.patch("/{item_id}", response_model=read_schema)
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

    @router.delete("/{item_id}", status_code=status.HTTP_204_NO_CONTENT)
    async def delete(
        item_id: UUID, session: AsyncSession = Depends(get_session)
    ) -> None:
        obj = await session.get(model, item_id)
        if obj is None:
            raise HTTPException(status.HTTP_404_NOT_FOUND, detail="Not found")
        await session.delete(obj)

    return router
