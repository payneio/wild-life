"""Routes for notes (with entity-link + type filters)."""

from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from personal_api.db.session import get_session
from personal_api.models.notes import Note
from personal_api.schemas.common import EntityType
from personal_api.schemas.notes import NoteCreate, NoteRead, NoteUpdate

router = APIRouter(prefix="/notes", tags=["notes"])


@router.post("", response_model=NoteRead, status_code=status.HTTP_201_CREATED)
async def create_note(
    payload: NoteCreate, session: AsyncSession = Depends(get_session)
) -> Note:
    note = Note(**payload.model_dump())
    session.add(note)
    await session.flush()
    await session.refresh(note)
    return note


@router.get("", response_model=list[NoteRead])
async def list_notes(
    session: AsyncSession = Depends(get_session),
    entity_type: EntityType | None = None,
    entity_id: UUID | None = None,
    note_type: str | None = None,
) -> list[Note]:
    stmt = select(Note)
    if entity_type is not None:
        stmt = stmt.where(Note.entity_type == entity_type)
    if entity_id is not None:
        stmt = stmt.where(Note.entity_id == entity_id)
    if note_type is not None:
        stmt = stmt.where(Note.note_type == note_type)
    stmt = stmt.order_by(Note.updated_at.desc())
    result = await session.execute(stmt)
    return list(result.scalars().all())


@router.get("/{item_id}", response_model=NoteRead)
async def get_note(item_id: UUID, session: AsyncSession = Depends(get_session)) -> Note:
    note = await session.get(Note, item_id)
    if note is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, detail="Not found")
    return note


@router.patch("/{item_id}", response_model=NoteRead)
async def update_note(
    item_id: UUID, payload: NoteUpdate, session: AsyncSession = Depends(get_session)
) -> Note:
    note = await session.get(Note, item_id)
    if note is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, detail="Not found")
    for field, value in payload.model_dump(exclude_unset=True).items():
        setattr(note, field, value)
    await session.flush()
    await session.refresh(note)
    return note


@router.delete("/{item_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_note(
    item_id: UUID, session: AsyncSession = Depends(get_session)
) -> None:
    note = await session.get(Note, item_id)
    if note is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, detail="Not found")
    await session.delete(note)
