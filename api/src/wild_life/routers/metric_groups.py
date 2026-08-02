"""Routes for metric groups, their membership, and the readings they produce."""

from collections import defaultdict
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import delete, select
from sqlalchemy.ext.asyncio import AsyncSession

from wild_life.db.session import get_session
from wild_life.record_moments import record_reading as record_panel_reading
from wild_life.models.metric_groups import GroupMember, GroupReading, MetricGroup
from wild_life.models.metrics import MetricEntry
from wild_life.routers.crud import crud_router
from wild_life.schemas.metric_groups import (
    GroupMemberCreate,
    GroupMemberRead,
    GroupMemberUpdate,
    GroupReadingCreate,
    GroupReadingRead,
    MemberOrder,
    MetricGroupCreate,
    MetricGroupRead,
    MetricGroupUpdate,
    ReadingEntry,
)

router = APIRouter()

router.include_router(
    crud_router(
        prefix="/metric-groups",
        tag="metric-groups",
        model=MetricGroup,
        create_schema=MetricGroupCreate,
        read_schema=MetricGroupRead,
        update_schema=MetricGroupUpdate,
        order_by=MetricGroup.name,
    )
)
router.include_router(
    crud_router(
        prefix="/group-members",
        tag="metric-groups",
        model=GroupMember,
        create_schema=GroupMemberCreate,
        read_schema=GroupMemberRead,
        update_schema=GroupMemberUpdate,
        order_by=GroupMember.position,
    )
)

nested = APIRouter(prefix="/metric-groups", tags=["metric-groups"])


async def _group_or_404(session: AsyncSession, group_id: UUID) -> MetricGroup:
    group = await session.get(MetricGroup, group_id)
    if group is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, detail="Metric group not found")
    return group


@nested.post(
    "/{group_id}/readings",
    response_model=GroupReadingRead,
    status_code=status.HTTP_201_CREATED,
    operation_id="metric_groups_record",
)
async def record_reading(
    group_id: UUID,
    payload: GroupReadingCreate,
    session: AsyncSession = Depends(get_session),
) -> GroupReadingRead:
    """Record one act of measuring, and everything it produced.

    One request rather than one per value: the numbers share a moment, and
    posting them separately is what produced five timestamps that ought to have
    been one. Nothing here requires the group's full membership — a metabolic
    panel has come back with one of fourteen — so whatever was measured is what
    gets written.
    """
    await _group_or_404(session, group_id)
    reading = GroupReading(
        group_id=group_id,
        recorded_at=payload.recorded_at,
        context=payload.context,
    )
    session.add(reading)
    await session.flush()

    for v in payload.values:
        session.add(
            MetricEntry(
                metric_id=v.metric_id,
                recorded_at=payload.recorded_at,
                value=v.value,
                group_reading_id=reading.id,
            )
        )
    await session.flush()
    await session.refresh(reading)
    # One act, N metrics, N values — the moment is the occasion they share.
    await record_panel_reading(
        session,
        reading_id=reading.id,
        recorded_at=payload.recorded_at,
        context=payload.context,
        values=[(v.metric_id, v.value) for v in payload.values],
    )
    return GroupReadingRead(
        **{c.name: getattr(reading, c.name) for c in reading.__table__.columns},
        entries=[
            ReadingEntry(metric_id=v.metric_id, value=v.value) for v in payload.values
        ],
    )


@nested.get(
    "/{group_id}/readings",
    response_model=list[GroupReadingRead],
    operation_id="metric_groups_readings",
)
async def list_readings(
    group_id: UUID, session: AsyncSession = Depends(get_session)
) -> list[GroupReadingRead]:
    """Every reading of this group, newest first, with its values.

    Entries are batch-loaded rather than fetched per reading — the table renders
    all of them at once, so an N+1 here would be one query per draw.
    """
    await _group_or_404(session, group_id)
    readings = list(
        (
            await session.execute(
                select(GroupReading)
                .where(GroupReading.group_id == group_id)
                .order_by(GroupReading.recorded_at.desc())
            )
        )
        .scalars()
        .all()
    )
    by_reading: dict[UUID, list[ReadingEntry]] = defaultdict(list)
    if readings:
        rows = (
            await session.execute(
                select(MetricEntry).where(
                    MetricEntry.group_reading_id.in_([r.id for r in readings])
                )
            )
        ).scalars()
        for e in rows:
            by_reading[e.group_reading_id].append(
                ReadingEntry(metric_id=e.metric_id, value=e.value)
            )
    return [
        GroupReadingRead(
            **{c.name: getattr(r, c.name) for c in r.__table__.columns},
            entries=by_reading[r.id],
        )
        for r in readings
    ]


@nested.put(
    "/{group_id}/members",
    response_model=list[GroupMemberRead],
    operation_id="metric_groups_set_members",
)
async def set_members(
    group_id: UUID,
    payload: MemberOrder,
    session: AsyncSession = Depends(get_session),
) -> list[GroupMember]:
    """Replace the membership with exactly this ordered list.

    The whole list rather than a move-one endpoint: a group is ten rows with one
    writer, so renumbering is cheaper than the fractional indexing `ranking.py`
    needs for a board someone drags all day.
    """
    await _group_or_404(session, group_id)
    await session.execute(delete(GroupMember).where(GroupMember.group_id == group_id))
    members = [
        GroupMember(group_id=group_id, metric_id=metric_id, position=i)
        for i, metric_id in enumerate(payload.metric_ids)
    ]
    session.add_all(members)
    await session.flush()
    return members


router.include_router(nested)
