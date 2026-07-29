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
    Query,
    Request,
    UploadFile,
    status,
)
from fastapi.responses import Response
from sqlalchemy import delete, func, or_, select, text
from sqlalchemy.ext.asyncio import AsyncSession
from starlette.concurrency import run_in_threadpool

from wild_life.backfill_moments import run as backfill
from wild_life.config import settings
from wild_life.db.session import get_session
from wild_life.models.moments import (
    CalendarRecord,
    Moment,
    MomentDose,
    MomentImage,
    MomentLink,
    MomentReading,
)
from wild_life.models.routines import Routine
from wild_life.query import apply_query
from wild_life.recurrence import Cadence, to_rrule
from wild_life.schemas.common import EntityType, MomentKind, MomentRole
from wild_life.routers.notes import MAX_IMAGE_BYTES
from wild_life.routers.notes import _sniff_image as sniff_image
from wild_life.schemas.moments import (
    CalendarRecordRead,
    CalendarRecordUpdate,
    MomentCreate,
    MomentImageRead,
    MomentLinkRead,
    MomentLinkRef,
    MomentRead,
    MomentUpdate,
)

router = APIRouter(prefix="/moments", tags=["moments"])

# Where a moment sits in time: what happened, or failing that where it is meant
# to. One expression, because a timeline shows both and a planned lunch has no
# occurrence to sort by.
_WHEN = func.coalesce(Moment.started_at, Moment.window_start)


# The roles that put a moment on a thing's *timeline*, as opposed to in its
# backlinks. `subject` is what a moment is about, `participant` who was there and
# `place` where — all three are involvement. A `mention` is the writing merely
# naming the thing, which belongs in "Mentioned in": listing it in both is what
# once made 18 of 20 backlink rows duplicate the list directly above them.
TIMELINE_ROLES: list[MomentRole] = ["subject", "participant", "place"]


def _linked(linked_type: EntityType, linked_id: UUID, roles: list[str] | None):
    """The subquery for "moments involving this thing", optionally by role."""
    edge = select(MomentLink.moment_id).where(
        MomentLink.entity_type == linked_type,
        MomentLink.entity_id == linked_id,
    )
    if roles:
        edge = edge.where(MomentLink.role.in_(roles))
    return edge


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
) -> dict[UUID, list[MomentLinkRead]]:
    """Each moment's involvements, carrying what the pairing produced.

    The payload is joined rather than fetched separately because it *is* the
    content of a small moment: a measurement's number and a dose's amount are
    what those moments say, and a reader that has the link but not the value has
    the shape of the act without the act.
    """
    out: dict[UUID, list[MomentLinkRead]] = defaultdict(list)
    if not moment_ids:
        return out
    result = await session.execute(
        select(MomentLink, MomentReading, MomentDose)
        .outerjoin(MomentReading, MomentReading.link_id == MomentLink.id)
        .outerjoin(MomentDose, MomentDose.link_id == MomentLink.id)
        .where(MomentLink.moment_id.in_(moment_ids))
    )
    for link, reading, dose in result:
        out[link.moment_id].append(
            MomentLinkRead(
                role=link.role,
                entity_type=link.entity_type,
                entity_id=link.entity_id,
                value=reading.value if reading else None,
                context=reading.context if reading else None,
                amount=dose.amount if dose else None,
                unit=dose.unit if dose else None,
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
    role: list[MomentRole] | None = Query(None),
    since: datetime | None = None,
    until: datetime | None = None,
    unfulfilled: bool | None = None,
    unfiled: bool | None = None,
) -> list[MomentRead]:
    """Moments, newest first.

    ``linked_type``/``linked_id`` is the timeline of a thing; add ``role`` to ask
    a narrower question ("moments *with* Melissa" rather than "moments involving
    her at all"). It is repeatable, because the useful questions are about sets
    of roles rather than one: a record's Log asks for ``TIMELINE_ROLES`` and its
    backlinks panel asks for ``mention``, which is the same distinction the role
    vocabulary was defined to make. ``unfulfilled`` is the derived lapse — a
    window that has passed with nothing having happened in it and no decision to
    drop it — which is a query rather than a stored state precisely so it can
    never go stale.
    """
    stmt = select(Moment)
    if kind is not None:
        stmt = stmt.where(Moment.kind == kind)
    if linked_type is not None and linked_id is not None:
        stmt = stmt.where(Moment.id.in_(_linked(linked_type, linked_id, role)))
    if since is not None:
        stmt = stmt.where(or_(Moment.started_at >= since, Moment.window_end >= since))
    if until is not None:
        stmt = stmt.where(or_(Moment.started_at <= until, Moment.window_start <= until))
    if unfiled is not None:
        # Nobody has said what it is about. The triage predicate — and its
        # inverse, which is how the Inbox learns a home for a repeated title.
        # Deliberately about the `subject` role only: an occasion with attendees
        # and a place but nothing it *concerns* is still unfiled.
        has_subject = select(MomentLink.moment_id).where(
            MomentLink.moment_id == Moment.id, MomentLink.role == "subject"
        )
        stmt = stmt.where(~has_subject.exists() if unfiled else has_subject.exists())
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
    role: list[MomentRole] | None = Query(None),
) -> list[dict]:
    """Per-(year, month) counts for a stream's navigation rail.

    Scoped exactly the way the list is — ``role`` included, which is why it is
    here at all — so the rail counts the rows the stream shows. A rail that
    disagrees with its stream is worse than no rail: it offers a month that
    scrolls nowhere.
    """
    year = func.extract("year", _WHEN)
    month = func.extract("month", _WHEN)
    stmt = select(
        year.label("year"), month.label("month"), func.count().label("count")
    ).where(_WHEN.isnot(None))
    if kind is not None:
        stmt = stmt.where(Moment.kind == kind)
    if linked_type is not None and linked_id is not None:
        stmt = stmt.where(Moment.id.in_(_linked(linked_type, linked_id, role)))
    stmt = stmt.group_by(year, month).order_by(year.desc(), month.desc())
    rows = (await session.execute(stmt)).all()
    return [
        {"year": int(r.year), "month": int(r.month), "count": int(r.count)}
        for r in rows
    ]


@router.get("/density", operation_id="moments_density")
async def moments_density(
    session: AsyncSession = Depends(get_session),
    linked_type: EntityType | None = None,
    linked_id: UUID | None = None,
) -> list[dict]:
    """Per-(year, month, kind) counts — the shape of the record over time.

    The rail (`/calendar`) answers "which months have anything"; this answers
    "what were they made of". One query rather than thirteen, because asking per
    kind would mean the client issuing a request per act and reassembling them.
    """
    year = func.extract("year", _WHEN)
    month = func.extract("month", _WHEN)
    stmt = (
        select(
            year.label("year"),
            month.label("month"),
            Moment.kind.label("kind"),
            func.count().label("count"),
        )
        .where(_WHEN.isnot(None))
        .group_by(year, month, Moment.kind)
        .order_by(year.desc(), month.desc())
    )
    if linked_type is not None and linked_id is not None:
        stmt = stmt.where(Moment.id.in_(_linked(linked_type, linked_id, None)))
    rows = (await session.execute(stmt)).all()
    return [
        {
            "year": int(r.year),
            "month": int(r.month),
            "kind": r.kind,
            "count": int(r.count),
        }
        for r in rows
    ]


@router.get(
    "/calendar-records",
    response_model=list[CalendarRecordRead],
    operation_id="calendar_records_list",
)
async def list_calendar_records(
    session: AsyncSession = Depends(get_session),
    external_ref: str | None = None,
    limit: int = 500,
    offset: int = 0,
) -> list[CalendarRecord]:
    """Everything shared, by wire UID — the importer's dedup index.

    Listing *projections* rather than moments is the point: a sync knows things
    by the UID it was given, and only what has been shared has one.
    """
    stmt = select(CalendarRecord)
    if external_ref is not None:
        stmt = stmt.where(CalendarRecord.external_ref == external_ref)
    stmt = stmt.limit(min(limit, 1000)).offset(offset)
    return list((await session.execute(stmt)).scalars().all())


@router.post("/{item_id}/auto-file", operation_id="moments_auto_file")
async def auto_file(
    item_id: UUID, session: AsyncSession = Depends(get_session)
) -> dict:
    """On-import filing: resolve attendee addresses to people, and inherit a
    subject from a same-titled occasion already filed.

    Both are applications of something already decided. An address that matches a
    person's card *is* a participant, and a home you deliberately gave "Therapy
    w/ Jessica" once is the answer for the next one. Nothing is invented: an
    unknown address stays on the projection as an address, because guessing a
    person into existence is worse than leaving a string alone.
    """
    moment = await session.get(Moment, item_id)
    if moment is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, detail="Not found")
    record = await session.get(CalendarRecord, item_id)

    linked = 0
    if record is not None:
        seen: set[UUID] = set()
        for raw in record.attendees or []:
            email = (raw or "").replace("mailto:", "").strip().lower()
            if "@" not in email:
                continue
            pid = (
                await session.execute(
                    text(
                        "SELECT id FROM wild_life.people WHERE EXISTS ("
                        "SELECT 1 FROM jsonb_array_elements(emails) el "
                        "WHERE lower(el->>'value') = :email) LIMIT 1"
                    ),
                    {"email": email},
                )
            ).scalar()
            # The frame is never a participant in its own life (see
            # `_reconcile_links`): 325 such edges were deleted for saying nothing.
            if pid is None or pid in seen or pid == settings.self_person_id:
                continue
            seen.add(pid)
            session.add(
                MomentLink(
                    moment_id=item_id,
                    role="participant",
                    entity_type="person",
                    entity_id=pid,
                )
            )
            linked += 1

    filed = False
    already = await session.scalar(
        select(MomentLink.id).where(
            MomentLink.moment_id == item_id, MomentLink.role == "subject"
        )
    )
    if already is None and moment.title:
        row = (
            await session.execute(
                text("""
                    SELECT l.entity_type, l.entity_id
                    FROM wild_life.moments m
                    JOIN wild_life.moment_links l
                      ON l.moment_id = m.id AND l.role = 'subject'
                    WHERE m.kind = :kind AND m.id <> :id
                      AND lower(trim(m.title)) = lower(trim(:title))
                    LIMIT 1
                """),
                {"kind": moment.kind, "id": item_id, "title": moment.title},
            )
        ).first()
        if row is not None:
            session.add(
                MomentLink(
                    moment_id=item_id,
                    role="subject",
                    entity_type=row[0],
                    entity_id=row[1],
                )
            )
            filed = True
    await session.flush()
    return {"linked": linked, "filed": filed}


# --- the shared projection --------------------------------------------------- #
#
# Privacy is structural: a moment with no calendar record has nothing to export.
# So creating one is an *act*, and these two routes are the only place in the
# application it happens besides an inbound invitation arriving.


@router.get(
    "/{item_id}/calendar",
    response_model=CalendarRecordRead | None,
    operation_id="moments_calendar_record",
)
async def get_calendar_record(
    item_id: UUID, session: AsyncSession = Depends(get_session)
) -> CalendarRecord | None:
    """What has been shared about this moment, or null — which is the default."""
    return await session.get(CalendarRecord, item_id)


@router.patch(
    "/{item_id}/calendar",
    response_model=CalendarRecordRead,
    operation_id="moments_share",
)
async def update_calendar_record(
    item_id: UUID,
    payload: CalendarRecordUpdate,
    session: AsyncSession = Depends(get_session),
) -> CalendarRecord:
    """Share a moment, or change what has been shared.

    Creates the projection on first call, because giving a moment a guest list is
    what makes it shareable — there is no separate "enable" to forget.
    """
    moment = await session.get(Moment, item_id)
    if moment is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, detail="Not found")
    record = await session.get(CalendarRecord, item_id)
    if record is None:
        record = CalendarRecord(moment_id=item_id, external_ref=f"{item_id}@wild-life")
        session.add(record)
    for field, value in payload.model_dump(exclude_unset=True).items():
        setattr(record, field, value)

    # If the moment belongs to a series of ours, the projection has to carry the
    # series too — a guest given only this occurrence is told about one meeting
    # out of fifty-two. Written *from* our cadence rather than stored twice, so
    # the two cannot drift. A cadence RFC 5545 cannot state leaves `recurrence`
    # null, and decision 8 exports those as RDATE rather than as a rule that lies
    # about them.
    if moment.rule_id is not None and not record.recurrence:
        rule = await session.get(Routine, moment.rule_id)
        anchor = moment.started_at or moment.window_start
        if rule is not None and anchor is not None:
            record.recurrence = to_rrule(
                Cadence(
                    days_of_week=list(rule.days_of_week or []),
                    interval_days=rule.interval_days or 1,
                    end_date=rule.end_date,
                ),
                anchor,
            )
    await session.flush()
    await session.refresh(record)
    return record


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
