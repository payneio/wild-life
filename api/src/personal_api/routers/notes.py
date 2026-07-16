"""Routes for notes (with entity-link + type filters + backlinks)."""

from collections import defaultdict
from datetime import date
from pathlib import Path
from uuid import UUID

from fastapi import APIRouter, Depends, File, HTTPException, Query, Request, UploadFile, status
from fastapi.responses import Response
from sqlalchemy import delete, func, select
from sqlalchemy.ext.asyncio import AsyncSession

from personal_api.config import settings
from personal_api.db.session import get_session
from personal_api.models.notes import Note, NoteImage, NoteMention
from personal_api.query import apply_query
from personal_api.schemas.common import EntityType
from personal_api.schemas.notes import (
    EntityRef,
    NoteCreate,
    NoteImageRead,
    NoteRead,
    NoteUpdate,
)

router = APIRouter(prefix="/notes", tags=["notes"])

MAX_IMAGE_BYTES = 20 * 1024 * 1024


def _image_path(note_id: UUID, image_id: UUID) -> Path:
    return settings.data_dir / "note_images" / str(note_id) / str(image_id)


def _sniff_image(data: bytes) -> str | None:
    if data[:3] == b"\xff\xd8\xff":
        return "image/jpeg"
    if data[:8] == b"\x89PNG\r\n\x1a\n":
        return "image/png"
    if data[:6] in (b"GIF87a", b"GIF89a"):
        return "image/gif"
    if data[:4] == b"RIFF" and data[8:12] == b"WEBP":
        return "image/webp"
    return None


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
    request: Request,
    session: AsyncSession = Depends(get_session),
    entity_type: EntityType | None = None,
    entity_id: UUID | None = None,
    note_type: str | None = None,
    linked_type: EntityType | None = None,
    linked_id: UUID | None = None,
    year: int | None = None,
    tag: str | None = None,
    no_tag: list[str] | None = Query(None),
) -> list[NoteRead]:
    stmt = select(Note)
    if entity_type is not None:
        stmt = stmt.where(Note.entity_type == entity_type)
    if entity_id is not None:
        stmt = stmt.where(Note.entity_id == entity_id)
    if note_type is not None:
        stmt = stmt.where(Note.note_type == note_type)
    if year is not None:
        stmt = stmt.where(Note.entry_date.between(date(year, 1, 1), date(year, 12, 31)))
    if tag is not None:
        stmt = stmt.where(Note.tags.contains([tag]))
    for t in no_tag or []:
        stmt = stmt.where(~Note.tags.contains([t]))
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
    stmt, limit, offset = apply_query(stmt, Note, request.query_params)
    if offset is not None:
        stmt = stmt.offset(offset)
    if limit is not None:
        stmt = stmt.limit(limit)
    result = await session.execute(stmt)
    notes = list(result.scalars().all())
    links = await _links_for(session, [n.id for n in notes])
    return [_read(n, links[n.id]) for n in notes]


@router.get("/calendar")
async def notes_calendar(
    session: AsyncSession = Depends(get_session),
    tag: str | None = None,
    no_tag: list[str] | None = Query(None),
) -> list[dict]:
    """Per-(year, month) entry counts for the journal's year/month navigation."""
    y = func.extract("year", Note.entry_date)
    m = func.extract("month", Note.entry_date)
    stmt = select(
        y.label("year"), m.label("month"), func.count().label("count")
    ).where(Note.entry_date.is_not(None))
    if tag is not None:
        stmt = stmt.where(Note.tags.contains([tag]))
    for t in no_tag or []:
        stmt = stmt.where(~Note.tags.contains([t]))
    stmt = stmt.group_by(y, m).order_by(y.desc(), m.desc())
    rows = (await session.execute(stmt)).all()
    return [
        {"year": int(r.year), "month": int(r.month), "count": int(r.count)}
        for r in rows
    ]


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


# --- note images ---------------------------------------------------------- #


@router.get("/{item_id}/images", response_model=list[NoteImageRead])
async def list_note_images(
    item_id: UUID, session: AsyncSession = Depends(get_session)
) -> list[NoteImage]:
    result = await session.execute(
        select(NoteImage)
        .where(NoteImage.note_id == item_id)
        .order_by(NoteImage.sort_order, NoteImage.created_at)
    )
    return list(result.scalars().all())


@router.post("/{item_id}/images", response_model=NoteImageRead, status_code=201)
async def upload_note_image(
    item_id: UUID,
    file: UploadFile = File(...),
    session: AsyncSession = Depends(get_session),
) -> NoteImage:
    """Attach an image to a note. Returns the image row; reference it in the body
    as ``![alt](note-image:<id>)``."""
    note = await session.get(Note, item_id)
    if note is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, detail="Note not found")
    data = await file.read()
    if len(data) > MAX_IMAGE_BYTES:
        raise HTTPException(status.HTTP_413_REQUEST_ENTITY_TOO_LARGE, detail="Too large")
    content_type = _sniff_image(data)
    if content_type is None:
        raise HTTPException(
            status.HTTP_400_BAD_REQUEST,
            detail="Not a supported image (jpeg/png/gif/webp)",
        )
    count = await session.scalar(
        select(NoteImage.id).where(NoteImage.note_id == item_id).limit(1)
    )
    img = NoteImage(
        note_id=item_id,
        filename=file.filename,
        content_type=content_type,
        sort_order=0 if count is None else 1,
    )
    session.add(img)
    await session.flush()
    path = _image_path(item_id, img.id)
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_bytes(data)
    await session.refresh(img)
    return img


images_router = APIRouter(prefix="/note-images", tags=["notes"])


@images_router.get("/{image_id}")
async def get_note_image(
    image_id: UUID, session: AsyncSession = Depends(get_session)
) -> Response:
    """Return image bytes (bearer-protected)."""
    img = await session.get(NoteImage, image_id)
    if img is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, detail="Not found")
    path = _image_path(img.note_id, img.id)
    if not path.exists():
        raise HTTPException(status.HTTP_404_NOT_FOUND, detail="Missing file")
    data = path.read_bytes()
    media = img.content_type or _sniff_image(data) or "application/octet-stream"
    return Response(content=data, media_type=media)


@images_router.delete("/{image_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_note_image(
    image_id: UUID, session: AsyncSession = Depends(get_session)
) -> None:
    img = await session.get(NoteImage, image_id)
    if img is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, detail="Not found")
    _image_path(img.note_id, img.id).unlink(missing_ok=True)
    await session.delete(img)
