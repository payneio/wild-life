"""Web Push subscription management."""

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import delete as sql_delete
from sqlalchemy import select
from sqlalchemy.dialects.postgresql import insert as pg_insert
from sqlalchemy.ext.asyncio import AsyncSession

from personal_api import push
from personal_api.db.session import get_session
from personal_api.models.push import PushSubscription
from personal_api.schemas.push import PushSubscriptionCreate, VapidPublicKey

router = APIRouter(prefix="/push", tags=["push"])


@router.get("/vapid-public-key", response_model=VapidPublicKey)
async def vapid_public_key() -> VapidPublicKey:
    if not push.is_enabled():
        raise HTTPException(
            status.HTTP_503_SERVICE_UNAVAILABLE, detail="Push not configured"
        )
    return VapidPublicKey(key=push.application_server_key())


@router.post("/subscriptions", status_code=status.HTTP_204_NO_CONTENT)
async def subscribe(
    payload: PushSubscriptionCreate,
    session: AsyncSession = Depends(get_session),
) -> None:
    """Register (or refresh) a browser push subscription, keyed by endpoint."""
    stmt = (
        pg_insert(PushSubscription)
        .values(
            endpoint=payload.endpoint,
            p256dh=payload.keys.p256dh,
            auth=payload.keys.auth,
            label=payload.label,
        )
        .on_conflict_do_update(
            index_elements=[PushSubscription.endpoint],
            set_={
                "p256dh": payload.keys.p256dh,
                "auth": payload.keys.auth,
                "label": payload.label,
            },
        )
    )
    await session.execute(stmt)


@router.delete("/subscriptions", status_code=status.HTTP_204_NO_CONTENT)
async def unsubscribe(
    endpoint: str,
    session: AsyncSession = Depends(get_session),
) -> None:
    await session.execute(
        sql_delete(PushSubscription).where(PushSubscription.endpoint == endpoint)
    )


@router.post("/test")
async def test_push(session: AsyncSession = Depends(get_session)) -> dict:
    """Send a simple test notification to every subscription (self-diagnosis)."""
    if not push.is_enabled():
        raise HTTPException(status.HTTP_503_SERVICE_UNAVAILABLE, detail="Push not configured")
    payload = {
        "kind": "test",
        "title": "Test ✅",
        "body": "Push notifications are working.",
        "url": "/",
        "tag": "push-test",
    }
    subs = (await session.execute(select(PushSubscription))).scalars().all()
    sent = pruned = 0
    gone: list = []
    for sub in subs:
        try:
            push.send_push(endpoint=sub.endpoint, p256dh=sub.p256dh, auth=sub.auth, payload=payload)
            sent += 1
        except push.SubscriptionGone:
            gone.append(sub.id)
            pruned += 1
        except Exception:  # noqa: BLE001
            pass
    if gone:
        await session.execute(sql_delete(PushSubscription).where(PushSubscription.id.in_(gone)))
    return {"subscriptions": len(subs), "sent": sent, "pruned": pruned}


@router.get("/subscriptions/count")
async def subscription_count(
    session: AsyncSession = Depends(get_session),
) -> dict[str, int]:
    """Small helper so the UI can show whether any device is subscribed."""
    rows = await session.execute(select(PushSubscription.id))
    return {"count": len(rows.all())}
