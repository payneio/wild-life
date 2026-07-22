"""Owner-only administration of API tokens (mint / list / revoke worker creds)."""

import secrets
import uuid

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from wild_life.db.session import get_session
from wild_life.identity import hash_token, registry, require_owner
from wild_life.models.auth import ApiToken
from wild_life.schemas.auth import ApiTokenCreate, ApiTokenCreated, ApiTokenRead

router = APIRouter(prefix="/admin/tokens", tags=["admin"])


@router.post(
    "",
    response_model=ApiTokenCreated,
    status_code=status.HTTP_201_CREATED,
    operation_id="admin_tokens_create",
    dependencies=[Depends(require_owner)],
)
async def create_token(
    payload: ApiTokenCreate, session: AsyncSession = Depends(get_session)
) -> ApiTokenCreated:
    """Mint a credential. Returns the raw token once; only its hash is stored."""
    raw = f"pt_{secrets.token_urlsafe(32)}"
    tok = ApiToken(
        label=payload.label,
        token_hash=hash_token(raw),
        person_id=payload.person_id,
        role=payload.role,
    )
    session.add(tok)
    await session.flush()
    await session.refresh(tok)
    await registry.reload(session)
    return ApiTokenCreated(**ApiTokenRead.model_validate(tok).model_dump(), token=raw)


@router.get(
    "",
    response_model=list[ApiTokenRead],
    operation_id="admin_tokens_list",
    dependencies=[Depends(require_owner)],
)
async def list_tokens(
    session: AsyncSession = Depends(get_session),
) -> list[ApiToken]:
    result = await session.execute(
        select(ApiToken).order_by(ApiToken.created_at.desc())
    )
    return list(result.scalars().all())


@router.post(
    "/{token_id}/revoke",
    status_code=status.HTTP_204_NO_CONTENT,
    operation_id="admin_tokens_revoke",
    dependencies=[Depends(require_owner)],
)
async def revoke_token(
    token_id: uuid.UUID, session: AsyncSession = Depends(get_session)
) -> None:
    tok = await session.get(ApiToken, token_id)
    if tok is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, detail="Not found")
    if tok.revoked_at is None:
        tok.revoked_at = func.now()
    await session.flush()
    await registry.reload(session)
