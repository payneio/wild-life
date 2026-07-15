"""Routes for people + interactions + contact photos."""

from pathlib import Path
from uuid import UUID

from fastapi import (
    APIRouter,
    Depends,
    File,
    HTTPException,
    UploadFile,
    status,
)
from fastapi.responses import Response
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from personal_api.config import settings
from personal_api.db.session import get_session
from personal_api.models.people import Interaction, Person
from personal_api.routers.crud import crud_router
from personal_api.schemas.people import (
    InteractionCreate,
    InteractionRead,
    InteractionUpdate,
    PersonCreate,
    PersonRead,
    PersonUpdate,
)

MAX_PHOTO_BYTES = 12 * 1024 * 1024


def _photo_path(person_id: UUID) -> Path:
    return settings.data_dir / "photos" / str(person_id)


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

router = APIRouter()

router.include_router(
    crud_router(
        prefix="/people",
        tag="people",
        model=Person,
        create_schema=PersonCreate,
        read_schema=PersonRead,
        update_schema=PersonUpdate,
        order_by=Person.name,
    )
)
router.include_router(
    crud_router(
        prefix="/interactions",
        tag="people",
        model=Interaction,
        create_schema=InteractionCreate,
        read_schema=InteractionRead,
        update_schema=InteractionUpdate,
        order_by=Interaction.occurred_at.desc(),
    )
)

nested = APIRouter(prefix="/people", tags=["people"])


@nested.get("/{person_id}/interactions", response_model=list[InteractionRead])
async def list_person_interactions(
    person_id: UUID, session: AsyncSession = Depends(get_session)
) -> list[Interaction]:
    person = await session.get(Person, person_id)
    if person is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, detail="Person not found")
    result = await session.execute(
        select(Interaction)
        .where(Interaction.person_id == person_id)
        .order_by(Interaction.occurred_at.desc())
    )
    return list(result.scalars().all())


@nested.get("/{person_id}/photo")
async def get_person_photo(person_id: UUID) -> Response:
    """Return the person's contact photo bytes (bearer-protected)."""
    path = _photo_path(person_id)
    if not path.exists():
        raise HTTPException(status.HTTP_404_NOT_FOUND, detail="No photo")
    data = path.read_bytes()
    media = _sniff_image(data) or "application/octet-stream"
    return Response(content=data, media_type=media)


@nested.post("/{person_id}/photo", response_model=PersonRead)
async def upload_person_photo(
    person_id: UUID,
    file: UploadFile = File(...),
    session: AsyncSession = Depends(get_session),
) -> Person:
    """Upload/replace a person's contact photo."""
    person = await session.get(Person, person_id)
    if person is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, detail="Person not found")
    data = await file.read()
    if len(data) > MAX_PHOTO_BYTES:
        raise HTTPException(status.HTTP_413_REQUEST_ENTITY_TOO_LARGE, detail="Too large")
    if _sniff_image(data) is None:
        raise HTTPException(
            status.HTTP_400_BAD_REQUEST, detail="Not a supported image (jpeg/png/gif/webp)"
        )
    path = _photo_path(person_id)
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_bytes(data)
    person.photo_url = f"/people/{person_id}/photo"
    await session.flush()
    await session.refresh(person)
    return person


@nested.delete("/{person_id}/photo", status_code=status.HTTP_204_NO_CONTENT)
async def delete_person_photo(
    person_id: UUID, session: AsyncSession = Depends(get_session)
) -> None:
    """Remove a person's contact photo."""
    person = await session.get(Person, person_id)
    if person is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, detail="Person not found")
    _photo_path(person_id).unlink(missing_ok=True)
    person.photo_url = None
    await session.flush()


router.include_router(nested)
