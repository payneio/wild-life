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

from fastapi import APIRouter, Depends
from sqlalchemy import select
from sqlalchemy import delete as sql_delete
from sqlalchemy.ext.asyncio import AsyncSession

from wild_life import push
from wild_life.config import settings
from wild_life.db.session import get_session
from wild_life.models.push import PushSubscription, SentReminder
from wild_life.routers.occurrences import collect
from wild_life.routers.stream import publish_event
from wild_life.schemas.push import ReminderTickResult

log = logging.getLogger("wild_life.reminders")

router = APIRouter(prefix="/calendar/reminders", tags=["reminders"])


def _lead_label(lead_minutes: int) -> str:
    if lead_minutes % 1440 == 0:
        d = lead_minutes // 1440
        return f"in {d} day{'s' if d != 1 else ''}"
    if lead_minutes % 60 == 0:
        h = lead_minutes // 60
        return f"in {h} hour{'s' if h != 1 else ''}"
    return f"in {lead_minutes} minutes"


@router.post("/tick", response_model=ReminderTickResult)
async def tick(session: AsyncSession = Depends(get_session)) -> ReminderTickResult:
    leads = settings.reminder_lead_minutes
    if not leads or not push.is_enabled():
        return ReminderTickResult(
            occurrences_notified=0, pushes_sent=0, subscriptions=0, pruned=0
        )

    now = datetime.now(UTC)
    horizon = now + timedelta(minutes=max(leads))

    # Everything the calendar would draw in the reminder window — plain moments,
    # wire rules expanded verbatim, and rules of ours projected. One answer to
    # "when does this happen", rather than a fourth expander living here.
    upcoming = await collect(session, now, horizon, kind=["occasion"])

    subs = (await session.execute(select(PushSubscription))).scalars().all()

    occurrences_notified = 0
    pushes_sent = 0
    pruned = 0
    gone_ids: list[Any] = []

    for entry in upcoming:
        occ = entry.start_at
        if occ is None or not (now < occ <= horizon):
            continue
        if entry.withdrawn_at is not None:
            continue
        # A projection is not a row, so a reminder is recorded against the series
        # and the slot it fired for.
        subject_id = entry.moment_id or entry.rule_id
        if subject_id is None:
            continue
        minutes_out = (occ - now).total_seconds() / 60
        due = [ln for ln in leads if 0 < minutes_out <= ln]
        if not due:
            continue
        # Which due leads have not already been recorded?
        existing = (
            (
                await session.execute(
                    select(SentReminder.lead_minutes).where(
                        SentReminder.moment_id == subject_id,
                        SentReminder.occurrence_start == occ,
                    )
                )
            )
            .scalars()
            .all()
        )
        fresh = [ln for ln in due if ln not in set(existing)]
        if not fresh:
            continue

        # Notify once for the most imminent due lead; record all fresh due
        # leads so the larger ones are suppressed (don't fire redundantly).
        notify_lead = min(fresh)
        payload = {
            "kind": "reminder",
            "title": entry.title or "Untitled",
            "body": _lead_label(notify_lead),
            "moment_id": str(subject_id),
            "start_at": occ.isoformat(),
            "location": entry.calendar.location if entry.calendar else None,
            "url": (
                f"/calendar/{entry.moment_id}"
                if entry.moment_id
                else f"/routines/{entry.rule_id}"
            ),
            "tag": f"reminder-{subject_id}-{occ.isoformat()}",
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
                    moment_id=subject_id, occurrence_start=occ, lead_minutes=ln
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
