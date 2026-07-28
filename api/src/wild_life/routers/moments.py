"""Routes for moments — one timeline, queried from whichever end you hold.

The list endpoint is the whole point: **the timeline of X is the moments linked
to X**, so a program's band, a person's history, a medication's dose log and "what
happened while I was at the clinic" are one query with different arguments,
rather than eight hand-written projections.
"""

from collections import defaultdict
from pathlib import Path
from datetime import UTC, datetime, timedelta
from uuid import UUID

from fastapi import (
    APIRouter,
    Depends,
    File,
    HTTPException,
    Request,
    UploadFile,
    status,
)
from fastapi.responses import Response
from sqlalchemy import delete, func, or_, select
from sqlalchemy.ext.asyncio import AsyncSession
from starlette.concurrency import run_in_threadpool

from wild_life.backfill_moments import run as backfill
from wild_life.config import settings
from wild_life.db.session import get_session
from wild_life.models.moments import Moment, MomentImage, MomentLink
from wild_life.query import apply_query
from wild_life.schemas.common import EntityType, MomentKind, MomentRole
from wild_life.routers.notes import MAX_IMAGE_BYTES
from wild_life.routers.notes import _sniff_image as sniff_image
from wild_life.schemas.moments import (
    MomentCreate,
    MomentImageRead,
    MomentLinkRef,
    MomentRead,
    MomentUpdate,
)

router = APIRouter(prefix="/moments", tags=["moments"])

# Where a moment sits in time: what happened, or failing that where it is meant
# to. One expression, because a timeline shows both and a planned lunch has no
# occurrence to sort by.
_WHEN = func.coalesce(Moment.started_at, Moment.window_start)


def _is_self(link: MomentLinkRef) -> bool:
    """Whether a link points at the frame rather than at something inside it."""
    return (
        link.entity_type == "person"
        and settings.self_person_id is not None
        and link.entity_id == settings.self_person_id
    )


async def _reconcile_links(
    session: AsyncSession, moment_id: UUID, links: list[MomentLinkRef]
) -> None:
    """Replace a moment's links with exactly ``links`` (deduped, self dropped).

    Self links are dropped here rather than rejected, because the composer sends
    what the prose says and the prose may well mention its own author. 325
    attendee edges and 15 journal mentions pointed at Paul before the backfill,
    all of them asserting that the writer was present at his own life. Keeping
    them would crowd out the link that carries information: who *else*.
    """
    await session.execute(delete(MomentLink).where(MomentLink.moment_id == moment_id))
    seen: set[tuple[str, str, UUID]] = set()
    for link in links:
        if _is_self(link):
            continue
        key = (link.role, link.entity_type, link.entity_id)
        if key in seen:
            continue
        seen.add(key)
        session.add(
            MomentLink(
                moment_id=moment_id,
                role=link.role,
                entity_type=link.entity_type,
                entity_id=link.entity_id,
            )
        )
    await session.flush()


async def _links_for(
    session: AsyncSession, moment_ids: list[UUID]
) -> dict[UUID, list[MomentLinkRef]]:
    out: dict[UUID, list[MomentLinkRef]] = defaultdict(list)
    if not moment_ids:
        return out
    result = await session.execute(
        select(MomentLink).where(MomentLink.moment_id.in_(moment_ids))
    )
    for link in result.scalars():
        out[link.moment_id].append(
            MomentLinkRef(
                role=link.role,
                entity_type=link.entity_type,
                entity_id=link.entity_id,
            )
        )
    return out


def _read(moment: Moment, links: list[MomentLinkRef]) -> MomentRead:
    read = MomentRead.model_validate(moment)
    read.links = links
    return read


@router.post(
    "",
    response_model=MomentRead,
    status_code=status.HTTP_201_CREATED,
    operation_id="moments_create",
)
async def create_moment(
    payload: MomentCreate, session: AsyncSession = Depends(get_session)
) -> MomentRead:
    moment = Moment(**payload.model_dump(exclude={"links"}))
    session.add(moment)
    await session.flush()
    await _reconcile_links(session, moment.id, payload.links)
    await session.refresh(moment)
    links = await _links_for(session, [moment.id])
    return _read(moment, links[moment.id])


@router.get("", response_model=list[MomentRead], operation_id="moments_list")
async def list_moments(
    request: Request,
    session: AsyncSession = Depends(get_session),
    kind: MomentKind | None = None,
    linked_type: EntityType | None = None,
    linked_id: UUID | None = None,
    role: MomentRole | None = None,
    since: datetime | None = None,
    until: datetime | None = None,
    unfulfilled: bool | None = None,
) -> list[MomentRead]:
    """Moments, newest first.

    ``linked_type``/``linked_id`` is the timeline of a thing; add ``role`` to ask
    a narrower question ("moments *with* Melissa" rather than "moments involving
    her at all"). ``unfulfilled`` is the derived lapse — a window that has passed
    with nothing having happened in it and no decision to drop it — which is a
    query rather than a stored state precisely so it can never go stale.
    """
    stmt = select(Moment)
    if kind is not None:
        stmt = stmt.where(Moment.kind == kind)
    if linked_type is not None and linked_id is not None:
        edge = select(MomentLink.moment_id).where(
            MomentLink.entity_type == linked_type,
            MomentLink.entity_id == linked_id,
        )
        if role is not None:
            edge = edge.where(MomentLink.role == role)
        stmt = stmt.where(Moment.id.in_(edge))
    if since is not None:
        stmt = stmt.where(or_(Moment.started_at >= since, Moment.window_end >= since))
    if until is not None:
        stmt = stmt.where(or_(Moment.started_at <= until, Moment.window_start <= until))
    if unfulfilled:
        stmt = stmt.where(
            Moment.window_end < func.now(),
            Moment.started_at.is_(None),
            Moment.withdrawn_at.is_(None),
        )
    stmt = stmt.order_by(_WHEN.desc().nullslast(), Moment.created_at.desc())
    stmt, limit, offset = apply_query(stmt, Moment, request.query_params)
    if offset is not None:
        stmt = stmt.offset(offset)
    stmt = stmt.limit(limit if limit is not None else 200)
    result = await session.execute(stmt)
    moments = list(result.scalars().all())
    links = await _links_for(session, [m.id for m in moments])
    return [_read(m, links[m.id]) for m in moments]


# --- the year/month rail -------------------------------------------------- #
#
# Declared before `/{item_id}`: FastAPI matches in declaration order, so a literal
# path that comes after a parameterised one is unreachable — /moments/calendar
# arrives as item_id="calendar" and fails to parse as a UUID.


@router.get("/calendar", operation_id="moments_calendar")
async def moments_calendar(
    session: AsyncSession = Depends(get_session),
    kind: MomentKind | None = None,
    linked_type: EntityType | None = None,
    linked_id: UUID | None = None,
) -> list[dict]:
    """Per-(year, month) counts for a stream's navigation rail.

    Scoped exactly the way the list is, so the rail counts the rows the stream
    shows. A rail that disagrees with its stream is worse than no rail.
    """
    year = func.extract("year", _WHEN)
    month = func.extract("month", _WHEN)
    stmt = select(
        year.label("year"), month.label("month"), func.count().label("count")
    ).where(_WHEN.isnot(None))
    if kind is not None:
        stmt = stmt.where(Moment.kind == kind)
    if linked_type is not None and linked_id is not None:
        stmt = stmt.where(
            Moment.id.in_(
                select(MomentLink.moment_id).where(
                    MomentLink.entity_type == linked_type,
                    MomentLink.entity_id == linked_id,
                )
            )
        )
    stmt = stmt.group_by(year, month).order_by(year.desc(), month.desc())
    rows = (await session.execute(stmt)).all()
    return [
        {"year": int(r.year), "month": int(r.month), "count": int(r.count)}
        for r in rows
    ]


@router.get("/{item_id}", response_model=MomentRead, operation_id="moments_get")
async def get_moment(
    item_id: UUID, session: AsyncSession = Depends(get_session)
) -> MomentRead:
    moment = await session.get(Moment, item_id)
    if moment is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, detail="Not found")
    links = await _links_for(session, [moment.id])
    return _read(moment, links[moment.id])


@router.patch("/{item_id}", response_model=MomentRead, operation_id="moments_update")
async def update_moment(
    item_id: UUID, payload: MomentUpdate, session: AsyncSession = Depends(get_session)
) -> MomentRead:
    moment = await session.get(Moment, item_id)
    if moment is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, detail="Not found")
    data = payload.model_dump(exclude_unset=True, exclude={"links"})
    for field, value in data.items():
        setattr(moment, field, value)
    if "links" in payload.model_fields_set:
        await _reconcile_links(session, moment.id, payload.links or [])
    await session.flush()
    await session.refresh(moment)
    links = await _links_for(session, [moment.id])
    return _read(moment, links[moment.id])


@router.delete(
    "/{item_id}",
    status_code=status.HTTP_204_NO_CONTENT,
    operation_id="moments_delete",
)
async def delete_moment(
    item_id: UUID, session: AsyncSession = Depends(get_session)
) -> None:
    moment = await session.get(Moment, item_id)
    if moment is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, detail="Not found")
    await session.delete(moment)


@router.post("/sync", operation_id="moments_sync")
async def sync(full: bool = False, hours: float = 2.0) -> dict[str, int]:
    """Mirror the tables that still write their own rows into the spine.

    Doses, readings and task completions are authored through their own surfaces
    and land in `routine_instances`, `metric_entries` and `tasks`. Until those
    surfaces move too, a moment for them exists only because this ran — so a dose
    logged at noon would otherwise be missing from the timeline until someone
    remembered to backfill.

    Same shape as `locations/tick`, and for the same reason its docstring gives:
    a rolling replay is what lets the live path stay simple. The window is
    generous rather than exact, because re-upserting a handful of rows is free
    and a stored high-water mark is a thing that can be wrong.

    `full=true` re-reads everything; that belongs nightly rather than every few
    minutes.
    """
    since = None if full else datetime.now(UTC) - timedelta(hours=hours)
    # The backfill is synchronous (it is also a CLI), so it runs off the event
    # loop rather than blocking every other request for the length of a scan.
    return await run_in_threadpool(backfill, dry_run=False, since=since)


# --- images ---------------------------------------------------------------- #
#
# Inherited from notes rather than left behind. Writing prose you cannot attach a
# photograph to is a smaller app than the one that exists, and 13 pictures on 7
# entries would otherwise become invisible the moment the surfaces move.


def _image_path(moment_id: UUID, image_id: UUID) -> Path:
    return settings.data_dir / "moment_images" / str(moment_id) / str(image_id)


@router.get("/{item_id}/images", response_model=list[MomentImageRead])
async def list_moment_images(
    item_id: UUID, session: AsyncSession = Depends(get_session)
) -> list[MomentImage]:
    result = await session.execute(
        select(MomentImage)
        .where(MomentImage.moment_id == item_id)
        .order_by(MomentImage.sort_order, MomentImage.created_at)
    )
    return list(result.scalars().all())


@router.post("/{item_id}/images", response_model=MomentImageRead, status_code=201)
async def upload_moment_image(
    item_id: UUID,
    file: UploadFile = File(...),
    session: AsyncSession = Depends(get_session),
) -> MomentImage:
    """Attach an image; reference it in the body as ``![alt](moment-image:<id>)``."""
    moment = await session.get(Moment, item_id)
    if moment is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, detail="Moment not found")
    data = await file.read()
    if len(data) > MAX_IMAGE_BYTES:
        raise HTTPException(
            status.HTTP_413_REQUEST_ENTITY_TOO_LARGE, detail="Too large"
        )
    content_type = sniff_image(data)
    if content_type is None:
        raise HTTPException(
            status.HTTP_400_BAD_REQUEST,
            detail="Not a supported image (jpeg/png/gif/webp)",
        )
    existing = await session.scalar(
        select(MomentImage.id).where(MomentImage.moment_id == item_id).limit(1)
    )
    img = MomentImage(
        moment_id=item_id,
        filename=file.filename,
        content_type=content_type,
        sort_order=0 if existing is None else 1,
    )
    session.add(img)
    await session.flush()
    path = _image_path(item_id, img.id)
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_bytes(data)
    await session.refresh(img)
    return img


images_router = APIRouter(prefix="/moment-images", tags=["moments"])


@images_router.get("/{image_id}")
async def get_moment_image(
    image_id: UUID, session: AsyncSession = Depends(get_session)
) -> Response:
    img = await session.get(MomentImage, image_id)
    if img is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, detail="Not found")
    path = _image_path(img.moment_id, img.id)
    if not path.exists():
        raise HTTPException(status.HTTP_404_NOT_FOUND, detail="Not found")
    return Response(
        path.read_bytes(),
        media_type=img.content_type or "application/octet-stream",
        headers={"Cache-Control": "private, max-age=31536000, immutable"},
    )


@images_router.delete("/{image_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_moment_image(
    image_id: UUID, session: AsyncSession = Depends(get_session)
) -> None:
    img = await session.get(MomentImage, image_id)
    if img is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, detail="Not found")
    path = _image_path(img.moment_id, img.id)
    path.unlink(missing_ok=True)
    await session.delete(img)
