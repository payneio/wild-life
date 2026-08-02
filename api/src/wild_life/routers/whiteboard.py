"""Whiteboard — GET/PUT over the single scratch buffer, plus what it displaced.

No ``crud_router``: there is nothing to list, create or delete. The row is
created on first write rather than seeded by a migration, so a GET against an
empty database answers with an empty buffer instead of a 404.

The PUT is a compare-and-set. A whole-document write that names no base version
cannot tell "I am replacing what I read" from "I am replacing something I never
saw", and on 2026-08-01 that distinction was the difference between a scratch
edit and losing the buffer: a phone opened this page offline, rendered the
unloaded buffer as an empty one, and flushed the three things typed into it when
it reconnected. Naming the base version makes that request unformable.
"""

from __future__ import annotations

import uuid
from datetime import UTC, datetime, timedelta

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import delete, func, select
from sqlalchemy.dialects.postgresql import insert as pg_insert
from sqlalchemy.ext.asyncio import AsyncSession

from wild_life.db.session import get_session
from wild_life.models.whiteboard import Whiteboard, WhiteboardRevision
from wild_life.schemas.whiteboard import (
    WhiteboardRead,
    WhiteboardRevisionContent,
    WhiteboardRevisionRead,
    WhiteboardWrite,
)

router = APIRouter(prefix="/whiteboard", tags=["whiteboard"])

ROW_ID = 1

# One snapshot per editing session, not per keystroke. Anything shorter records
# the debounce; anything much longer loses the shape of a day's edits.
SESSION_GAP = timedelta(minutes=15)

# Deep enough that the revisions span months at one per session, shallow enough
# that the table stays a buffer rather than an archive.
KEEP_REVISIONS = 200

PREVIEW_CHARS = 120


@router.get("", response_model=WhiteboardRead, operation_id="whiteboard_get")
async def get_whiteboard(
    session: AsyncSession = Depends(get_session),
) -> WhiteboardRead:
    board = await session.get(Whiteboard, ROW_ID)
    if board is None:
        return WhiteboardRead(content="", version=0, updated_at=None)
    return WhiteboardRead(
        content=board.content, version=board.version, updated_at=board.updated_at
    )


@router.put("", response_model=WhiteboardRead, operation_id="whiteboard_set")
async def set_whiteboard(
    payload: WhiteboardWrite,
    session: AsyncSession = Depends(get_session),
) -> WhiteboardRead:
    # Locked for the transaction: two writers that read version 4 must not both
    # find it unchanged and both write version 5.
    current = (
        await session.execute(
            select(Whiteboard).where(Whiteboard.id == ROW_ID).with_for_update()
        )
    ).scalar_one_or_none()
    live_version = current.version if current is not None else 0

    if payload.base_version != live_version:
        raise HTTPException(
            status.HTTP_409_CONFLICT,
            detail=(
                f"The whiteboard has moved on: you are writing over version "
                f"{payload.base_version}, and it is now at {live_version}."
            ),
        )

    if current is not None:
        await _snapshot(session, current)

    stmt = (
        pg_insert(Whiteboard)
        .values(id=ROW_ID, content=payload.content, version=live_version + 1)
        .on_conflict_do_update(
            index_elements=["id"],
            # `onupdate` on the column is ORM-level and never fires for a Core
            # upsert, so the timestamp is set here or it stays at the insert time.
            set_={
                "content": payload.content,
                "version": live_version + 1,
                "updated_at": func.now(),
            },
        )
        # Columns, not the entity: the `SELECT ... FOR UPDATE` above already put
        # this row in the identity map, and returning the mapped class hands
        # back that instance with its pre-write attributes still on it.
        .returning(Whiteboard.content, Whiteboard.version, Whiteboard.updated_at)
    )
    content, new_version, updated_at = (await session.execute(stmt)).one()
    return WhiteboardRead(content=content, version=new_version, updated_at=updated_at)


async def _snapshot(session: AsyncSession, current: Whiteboard) -> None:
    """Keep the outgoing text if it is the last word of a finished session.

    The test is against the previous *write*, not the previous revision: a write
    arriving after a quiet spell is the first of a new session, so what it
    displaces is how the last session ended — which is the state a person would
    ask for. Keying off the last revision instead would keep each session's
    opening keystrokes and discard everything written after them.
    """
    if not current.content:
        return
    if datetime.now(UTC) - current.updated_at < SESSION_GAP:
        return

    session.add(
        WhiteboardRevision(content=current.content, version=current.version),
    )
    await session.flush()

    keep = (
        select(WhiteboardRevision.id)
        .order_by(WhiteboardRevision.replaced_at.desc())
        .limit(KEEP_REVISIONS)
    ).scalar_subquery()
    await session.execute(
        delete(WhiteboardRevision).where(WhiteboardRevision.id.notin_(keep))
    )


@router.get(
    "/revisions",
    response_model=list[WhiteboardRevisionRead],
    operation_id="whiteboard_revisions",
)
async def list_revisions(
    session: AsyncSession = Depends(get_session),
) -> list[WhiteboardRevisionRead]:
    rows = (
        (
            await session.execute(
                select(WhiteboardRevision).order_by(
                    WhiteboardRevision.replaced_at.desc()
                )
            )
        )
        .scalars()
        .all()
    )
    return [
        WhiteboardRevisionRead(
            id=r.id,
            version=r.version,
            replaced_at=r.replaced_at,
            size=len(r.content),
            preview=r.content[:PREVIEW_CHARS],
        )
        for r in rows
    ]


@router.get(
    "/revisions/{revision_id}",
    response_model=WhiteboardRevisionContent,
    operation_id="whiteboard_revision",
)
async def get_revision(
    revision_id: uuid.UUID,
    session: AsyncSession = Depends(get_session),
) -> WhiteboardRevisionContent:
    rev = await session.get(WhiteboardRevision, revision_id)
    if rev is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, detail="No such revision")
    return WhiteboardRevisionContent.model_validate(rev)
