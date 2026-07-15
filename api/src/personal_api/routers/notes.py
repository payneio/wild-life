"""Routes for notes (with entity-link + type filters + backlinks)."""

from collections import defaultdict
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import delete, select
from sqlalchemy.ext.asyncio import AsyncSession

from personal_api.db.session import get_session
from personal_api.models.notes import Note, NoteMention
from personal_api.schemas.common import EntityType
from personal_api.schemas.notes import EntityRef, NoteCreate, NoteRead, NoteUpdate

router = APIRouter(prefix="/notes", tags=["notes"])


async def _reconcile_links(
    session: AsyncSession, note_id: UUID, links: list[EntityRef]
) -> None:
    """Replace a note's mention rows with exactly ``links`` (deduped)."""
    await session.execute(delete(NoteMention).where(NoteMention.note_id == note_id))
    seen: set[tuple[str, UUID]] = set()
    for link in links:
        key = (link.target_type, link.target_id)
        if key in seen:
            continue
        seen.add(key)
        session.add(
            NoteMention(
                note_id=note_id,
                target_type=link.target_type,
                target_id=link.target_id,
            )
        )
    await session.flush()


async def _links_for(session: AsyncSession, note_ids: list[UUID]) -> dict[UUID, list[EntityRef]]:
    """Batch-load mention rows for the given notes, grouped by note id."""
    out: dict[UUID, list[EntityRef]] = defaultdict(list)
    if not note_ids:
        return out
    result = await session.execute(
        select(NoteMention).where(NoteMention.note_id.in_(note_ids))
    )
    for m in result.scalars():
        out[m.note_id].append(
            EntityRef(target_type=m.target_type, target_id=m.target_id)
        )
    return out


def _read(note: Note, links: list[EntityRef]) -> NoteRead:
    read = NoteRead.model_validate(note)
    read.links = links
    return read


@router.post("", response_model=NoteRead, status_code=status.HTTP_201_CREATED)
async def create_note(
    payload: NoteCreate, session: AsyncSession = Depends(get_session)
) -> NoteRead:
    note = Note(**payload.model_dump(exclude={"links"}))
    session.add(note)
    await session.flush()
    await _reconcile_links(session, note.id, payload.links)
    await session.refresh(note)
    return _read(note, payload.links)


@router.get("", response_model=list[NoteRead])
async def list_notes(
    session: AsyncSession = Depends(get_session),
    entity_type: EntityType | None = None,
    entity_id: UUID | None = None,
    note_type: str | None = None,
    linked_type: EntityType | None = None,
    linked_id: UUID | None = None,
) -> list[NoteRead]:
    stmt = select(Note)
    if entity_type is not None:
        stmt = stmt.where(Note.entity_type == entity_type)
    if entity_id is not None:
        stmt = stmt.where(Note.entity_id == entity_id)
    if note_type is not None:
        stmt = stmt.where(Note.note_type == note_type)
    if linked_type is not None and linked_id is not None:
        stmt = stmt.where(
            Note.id.in_(
                select(NoteMention.note_id).where(
                    NoteMention.target_type == linked_type,
                    NoteMention.target_id == linked_id,
                )
            )
        )
    stmt = stmt.order_by(Note.entry_date.desc().nulls_last(), Note.updated_at.desc())
    result = await session.execute(stmt)
    notes = list(result.scalars().all())
    links = await _links_for(session, [n.id for n in notes])
    return [_read(n, links[n.id]) for n in notes]


@router.get("/{item_id}", response_model=NoteRead)
async def get_note(
    item_id: UUID, session: AsyncSession = Depends(get_session)
) -> NoteRead:
    note = await session.get(Note, item_id)
    if note is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, detail="Not found")
    links = await _links_for(session, [note.id])
    return _read(note, links[note.id])


@router.patch("/{item_id}", response_model=NoteRead)
async def update_note(
    item_id: UUID, payload: NoteUpdate, session: AsyncSession = Depends(get_session)
) -> NoteRead:
    note = await session.get(Note, item_id)
    if note is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, detail="Not found")
    data = payload.model_dump(exclude_unset=True, exclude={"links"})
    for field, value in data.items():
        setattr(note, field, value)
    if "links" in payload.model_fields_set:
        await _reconcile_links(session, note.id, payload.links or [])
    await session.flush()
    await session.refresh(note)
    links = await _links_for(session, [note.id])
    return _read(note, links[note.id])


@router.delete("/{item_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_note(
    item_id: UUID, session: AsyncSession = Depends(get_session)
) -> None:
    note = await session.get(Note, item_id)
    if note is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, detail="Not found")
    await session.delete(note)
