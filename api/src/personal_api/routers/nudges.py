"""Proactive nudges — a once-a-day morning digest pushed to subscribed devices.

Reuses the Web Push plumbing (VAPID, subscriptions) from the reminders module.
Deduped per day via SentNudge so re-ticks don't resend.
"""

from __future__ import annotations

import logging
from datetime import UTC, date, datetime, time

from fastapi import APIRouter, Depends
from sqlalchemy import func, or_, select
from sqlalchemy import delete as sql_delete
from sqlalchemy.ext.asyncio import AsyncSession

from personal_api import push
from personal_api.db.session import get_session
from personal_api.models.calendar import Event
from personal_api.models.health import Medication
from personal_api.models.people import Person
from personal_api.models.push import PushSubscription, SentNudge
from personal_api.models.requests import Request
from personal_api.models.tasks import Task
from personal_api.models.tracking import Delegation
from personal_api.routers.stream import publish_event

log = logging.getLogger("personal_api.nudges")

router = APIRouter(prefix="/nudges", tags=["nudges"])


async def _count(session: AsyncSession, stmt) -> int:
    return int((await session.scalar(stmt)) or 0)


async def _digest_lines(session: AsyncSession, today: date) -> list[str]:
    start = datetime.combine(today, time.min, tzinfo=UTC)
    end = datetime.combine(today, time.max, tzinfo=UTC)
    mmdd = today.strftime("%m-%d")

    events_n = await _count(
        session,
        select(func.count())
        .select_from(Event)
        .where(Event.start_at >= start, Event.start_at <= end),
    )
    tasks_n = await _count(
        session,
        select(func.count())
        .select_from(Task)
        .where(
            or_(Task.due_date == today, Task.scheduled_date == today),
            Task.status.notin_(["completed", "cancelled"]),
        ),
    )
    followups_n = await _count(
        session,
        select(func.count())
        .select_from(Request)
        .where(Request.follow_up_date == today, Request.status == "open"),
    ) + await _count(
        session,
        select(func.count())
        .select_from(Delegation)
        .where(
            or_(
                Delegation.follow_up_date == today,
                Delegation.expected_completion_date == today,
            )
        ),
    )
    meds_n = await _count(
        session,
        select(func.count())
        .select_from(Medication)
        .where(Medication.status == "active"),
    )
    bdays_n = await _count(
        session,
        select(func.count())
        .select_from(Person)
        .where(func.to_char(Person.birthday, "MM-DD") == mmdd),
    )

    lines = []
    if events_n:
        lines.append(f"{events_n} event{'s' if events_n != 1 else ''}")
    if tasks_n:
        lines.append(f"{tasks_n} task{'s' if tasks_n != 1 else ''} due")
    if followups_n:
        lines.append(f"{followups_n} follow-up{'s' if followups_n != 1 else ''}")
    if meds_n:
        lines.append(f"{meds_n} meds")
    if bdays_n:
        lines.append(f"🎂 {bdays_n} birthday{'s' if bdays_n != 1 else ''}")
    return lines


@router.post("/digest")
async def digest(session: AsyncSession = Depends(get_session)) -> dict:
    """Send today's one-line agenda digest as a push (once per day)."""
    today = datetime.now(UTC).date()
    already = await session.scalar(
        select(SentNudge).where(
            SentNudge.kind == "digest", SentNudge.nudge_date == today
        )
    )
    if already is not None:
        return {"sent": False, "reason": "already sent today"}

    lines = await _digest_lines(session, today)
    body = " · ".join(lines) if lines else "Nothing scheduled — a clear day."
    payload = {
        "kind": "digest",
        "title": "Good morning ☀️",
        "body": body,
        "url": "/today",
        "tag": f"digest-{today.isoformat()}",
    }

    if not push.is_enabled():
        return {"sent": False, "reason": "push disabled", "body": body}

    subs = (await session.execute(select(PushSubscription))).scalars().all()
    sent = pruned = 0
    gone: list = []
    for sub in subs:
        try:
            push.send_push(
                endpoint=sub.endpoint, p256dh=sub.p256dh, auth=sub.auth, payload=payload
            )
            sent += 1
        except push.SubscriptionGone:
            gone.append(sub.id)
            pruned += 1
        except Exception:  # noqa: BLE001
            log.exception("digest push failed for %s", sub.endpoint)
    if gone:
        await session.execute(
            sql_delete(PushSubscription).where(PushSubscription.id.in_(gone))
        )

    await publish_event("digest", payload)
    session.add(SentNudge(kind="digest", nudge_date=today))
    return {"sent": True, "body": body, "pushes": sent, "pruned": pruned}
