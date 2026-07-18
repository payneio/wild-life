"""Request routes: the inbox primitive (create / list / inbox / resolve).

Reads are global. A worker may create a Request (attributed to itself) and may
update/resolve a Request it is party to (requester or addressee); it cannot delete
(blocked coarsely by the auth middleware).
"""

from datetime import datetime, timezone
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, Request as HttpRequest, status
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from personal_api.db.session import get_session
from personal_api.identity import Identity, current_identity
from personal_api.models.requests import Request
from personal_api.query import apply_query
from personal_api.schemas.common import RequestStatus
from personal_api.schemas.requests import (
    RequestCreate,
    RequestRead,
    RequestResolve,
    RequestUpdate,
)

router = APIRouter(prefix="/requests", tags=["requests"])


def _assert_party(req: Request, identity: Identity) -> None:
    """A worker may only touch a Request it requested or was addressed."""
    if not identity.is_worker:
        return
    if identity.person_id not in (req.requester_id, req.addressee_id):
        raise HTTPException(status.HTTP_403_FORBIDDEN, detail="Not your request")


@router.post(
    "",
    response_model=RequestRead,
    status_code=status.HTTP_201_CREATED,
    operation_id="requests_create",
)
async def create_request(
    payload: RequestCreate,
    session: AsyncSession = Depends(get_session),
    identity: Identity = Depends(current_identity),
) -> Request:
    values = payload.model_dump()
    # Attribute to the caller by default; a worker may only request as itself.
    if values.get("requester_id") is None or identity.is_worker:
        values["requester_id"] = identity.person_id
    req = Request(**values)
    session.add(req)
    await session.flush()
    await session.refresh(req)
    return req


@router.get("", response_model=list[RequestRead], operation_id="requests_list")
async def list_requests(
    request: HttpRequest,
    session: AsyncSession = Depends(get_session),
    requester_id: UUID | None = None,
    addressee_id: UUID | None = None,
    status_filter: RequestStatus | None = None,
) -> list[Request]:
    stmt = select(Request)
    if requester_id is not None:
        stmt = stmt.where(Request.requester_id == requester_id)
    if addressee_id is not None:
        stmt = stmt.where(Request.addressee_id == addressee_id)
    if status_filter is not None:
        stmt = stmt.where(Request.status == status_filter)
    stmt = stmt.order_by(Request.created_at.desc())
    stmt, limit, offset = apply_query(stmt, Request, request.query_params)
    if offset is not None:
        stmt = stmt.offset(offset)
    if limit is not None:
        stmt = stmt.limit(limit)
    result = await session.execute(stmt)
    return list(result.scalars().all())


@router.get("/inbox", response_model=list[RequestRead], operation_id="requests_inbox")
async def my_inbox(
    session: AsyncSession = Depends(get_session),
    identity: Identity = Depends(current_identity),
    include_resolved: bool = False,
) -> list[Request]:
    """Open Requests addressed to the caller — their inbox."""
    if identity.person_id is None:
        return []
    stmt = select(Request).where(Request.addressee_id == identity.person_id)
    if not include_resolved:
        stmt = stmt.where(Request.status == "open")
    stmt = stmt.order_by(
        Request.needed_by.asc().nulls_last(), Request.created_at.desc()
    )
    result = await session.execute(stmt)
    return list(result.scalars().all())


@router.get("/{item_id}", response_model=RequestRead, operation_id="requests_get")
async def get_request(
    item_id: UUID, session: AsyncSession = Depends(get_session)
) -> Request:
    req = await session.get(Request, item_id)
    if req is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, detail="Not found")
    return req


@router.patch("/{item_id}", response_model=RequestRead, operation_id="requests_update")
async def update_request(
    item_id: UUID,
    payload: RequestUpdate,
    session: AsyncSession = Depends(get_session),
    identity: Identity = Depends(current_identity),
) -> Request:
    req = await session.get(Request, item_id)
    if req is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, detail="Not found")
    _assert_party(req, identity)
    for field, value in payload.model_dump(exclude_unset=True).items():
        setattr(req, field, value)
    await session.flush()
    await session.refresh(req)
    return req


@router.post(
    "/{item_id}/resolve",
    response_model=RequestRead,
    operation_id="requests_resolve",
)
async def resolve_request(
    item_id: UUID,
    payload: RequestResolve,
    session: AsyncSession = Depends(get_session),
    identity: Identity = Depends(current_identity),
) -> Request:
    """Answer a Request — only its addressee (or the owner) may resolve it."""
    req = await session.get(Request, item_id)
    if req is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, detail="Not found")
    if identity.is_worker and identity.person_id != req.addressee_id:
        raise HTTPException(
            status.HTTP_403_FORBIDDEN, detail="Only the addressee may resolve"
        )
    req.status = "resolved"
    req.resolved_at = datetime.now(timezone.utc)
    if payload.resolution is not None:
        req.resolution = payload.resolution
    await session.flush()
    await session.refresh(req)
    return req


@router.delete(
    "/{item_id}",
    status_code=status.HTTP_204_NO_CONTENT,
    operation_id="requests_delete",
)
async def delete_request(
    item_id: UUID, session: AsyncSession = Depends(get_session)
) -> None:
    req = await session.get(Request, item_id)
    if req is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, detail="Not found")
    await session.delete(req)
