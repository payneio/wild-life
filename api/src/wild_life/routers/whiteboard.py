"""Whiteboard — GET/PUT over the single scratch buffer.

Two endpoints, no ``crud_router``: there is nothing to list, create or delete.
The row is created on first write rather than seeded by a migration, so a GET
against an empty database answers with an empty buffer instead of a 404.
"""

from __future__ import annotations

from fastapi import APIRouter, Depends
from sqlalchemy.dialects.postgresql import insert as pg_insert
from sqlalchemy.ext.asyncio import AsyncSession

from wild_life.db.session import get_session
from wild_life.models.whiteboard import Whiteboard
from wild_life.schemas.whiteboard import WhiteboardRead, WhiteboardWrite

router = APIRouter(prefix="/whiteboard", tags=["whiteboard"])

ROW_ID = 1


@router.get("", response_model=WhiteboardRead, operation_id="whiteboard_get")
async def get_whiteboard(
    session: AsyncSession = Depends(get_session),
) -> WhiteboardRead:
    board = await session.get(Whiteboard, ROW_ID)
    if board is None:
        return WhiteboardRead(content="", updated_at=None)
    return WhiteboardRead(content=board.content, updated_at=board.updated_at)


@router.put("", response_model=WhiteboardRead, operation_id="whiteboard_set")
async def set_whiteboard(
    payload: WhiteboardWrite,
    session: AsyncSession = Depends(get_session),
) -> WhiteboardRead:
    stmt = (
        pg_insert(Whiteboard)
        .values(id=ROW_ID, content=payload.content)
        .on_conflict_do_update(index_elements=["id"], set_={"content": payload.content})
        .returning(Whiteboard)
    )
    board = (await session.execute(stmt)).scalar_one()
    return WhiteboardRead(content=board.content, updated_at=board.updated_at)
