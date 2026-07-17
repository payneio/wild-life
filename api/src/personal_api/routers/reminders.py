"""Calendar reminders — expand due events and deliver Web Push notifications.

Driven by a periodic ``POST /calendar/reminders/tick`` (a castle job calls it).
The tick is idempotent: every delivered reminder is recorded in
``sent_reminders`` keyed by (event, occurrence, lead), so re-ticks never resend
and recurring events fire once per occurrence per lead.
"""

from __future__ import annotations

import logging
from datetime import UTC, datetime, timedelta
from typing import Any

from dateutil.rrule import rrulestr
from fastapi import APIRouter, Depends
from sqlalchemy import or_, select
from sqlalchemy import delete as sql_delete
from sqlalchemy.ext.asyncio import AsyncSession

from personal_api import push
from personal_api.config import settings
from personal_api.db.session import get_session
from personal_api.models.calendar import Event
from personal_api.models.push import PushSubscription, SentReminder
from personal_api.routers.stream import publish_event
from personal_api.schemas.push import ReminderTickResult

log = logging.getLogger("personal_api.reminders")

router = APIRouter(prefix="/calendar/reminders", tags=["reminders"])


def _lead_label(lead_minutes: int) -> str:
    if lead_minutes % 1440 == 0:
        d = lead_minutes // 1440
        return f"in {d} day{'s' if d != 1 else ''}"
    if lead_minutes % 60 == 0:
        h = lead_minutes // 60
        return f"in {h} hour{'s' if h != 1 else ''}"
    return f"in {lead_minutes} minutes"


def _occurrences(event: Event, now: datetime, horizon: datetime) -> list[datetime]:
    """Future occurrence start times of ``event`` within (now, horizon]."""
    start = event.start_at
    if start.tzinfo is None:
        start = start.replace(tzinfo=UTC)
    if not event.recurrence:
        return [start] if now < start <= horizon else []

    try:
        rule = rrulestr(f"RRULE:{event.recurrence}", dtstart=start)
    except (ValueError, TypeError):
        log.warning("bad RRULE on event %s: %r", event.id, event.recurrence)
        return [start] if now < start <= horizon else []

    exdates = set(event.recurrence_exdates or [])
    out: list[datetime] = []
    for occ in rule.between(now, horizon, inc=True):
        if occ.isoformat() in exdates or occ.date().isoformat() in exdates:
            continue
        if now < occ <= horizon:
            out.append(occ)
    return out


@router.post("/tick", response_model=ReminderTickResult)
async def tick(session: AsyncSession = Depends(get_session)) -> ReminderTickResult:
    leads = settings.reminder_lead_minutes
    if not leads or not push.is_enabled():
        return ReminderTickResult(
            occurrences_notified=0, pushes_sent=0, subscriptions=0, pruned=0
        )

    now = datetime.now(UTC)
    horizon = now + timedelta(minutes=max(leads))

    # Candidate events: recurring (may have started long ago) or single events
    # whose start falls within the reminder horizon.
    rows = await session.execute(
        select(Event).where(
            or_(
                Event.recurrence.is_not(None),
                (Event.start_at > now - timedelta(minutes=5))
                & (Event.start_at <= horizon),
            )
        )
    )
    events = rows.scalars().all()

    subs = (await session.execute(select(PushSubscription))).scalars().all()

    occurrences_notified = 0
    pushes_sent = 0
    pruned = 0
    gone_ids: list[Any] = []

    for event in events:
        for occ in _occurrences(event, now, horizon):
            minutes_out = (occ - now).total_seconds() / 60
            due = [ln for ln in leads if 0 < minutes_out <= ln]
            if not due:
                continue
            # Which due leads have not already been recorded?
            existing = (
                await session.execute(
                    select(SentReminder.lead_minutes).where(
                        SentReminder.event_id == event.id,
                        SentReminder.occurrence_start == occ,
                    )
                )
            ).scalars().all()
            fresh = [ln for ln in due if ln not in set(existing)]
            if not fresh:
                continue

            # Notify once for the most imminent due lead; record all fresh due
            # leads so the larger ones are suppressed (don't fire redundantly).
            notify_lead = min(fresh)
            payload = {
                "kind": "reminder",
                "title": event.title,
                "body": _lead_label(notify_lead),
                "event_id": str(event.id),
                "start_at": occ.isoformat(),
                "location": event.location,
                "url": f"/events/{event.id}",
                "tag": f"reminder-{event.id}-{occ.isoformat()}",
            }

            for sub in subs:
                try:
                    push.send_push(
                        endpoint=sub.endpoint,
                        p256dh=sub.p256dh,
                        auth=sub.auth,
                        payload=payload,
                    )
                    pushes_sent += 1
                except push.SubscriptionGone:
                    gone_ids.append(sub.id)
                    pruned += 1
                except Exception:  # noqa: BLE001 — one bad sub shouldn't stop the tick
                    log.exception("push send failed for %s", sub.endpoint)

            await publish_event("reminder", payload)
            occurrences_notified += 1

            for ln in fresh:
                session.add(
                    SentReminder(
                        event_id=event.id, occurrence_start=occ, lead_minutes=ln
                    )
                )

    if gone_ids:
        await session.execute(
            sql_delete(PushSubscription).where(PushSubscription.id.in_(gone_ids))
        )

    return ReminderTickResult(
        occurrences_notified=occurrences_notified,
        pushes_sent=pushes_sent,
        subscriptions=len(subs),
        pruned=pruned,
    )
