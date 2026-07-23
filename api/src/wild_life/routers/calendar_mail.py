"""Calendar mail — two-way iMIP over the API's own transport.

The two-way sync runs automatically in-process (see ``mail.scheduler`` — a poll
loop started by the app lifespan), and can also be triggered manually via
`POST /calendar/mail/tick`:
  1. Hosted events — email METHOD:REQUEST to new/changed guests and METHOD:CANCEL
     to removed guests or fully-cancelled events (idempotent via the SentInvite
     ledger; a soft-cancelled event is hard-deleted once every guest is cancelled).
  2. Received invites — email METHOD:REPLY when my rsvp_status changed (absorbs the
     old calendar-mail `rsvp` job).
  3. Inbound IMAP — ingest others' invites (REQUEST/CANCEL) and my guests' responses
     (REPLY) (absorbs the old `ingest` job).

`POST /events/{id}/invites/send` opts an event in and sends its pending invites
synchronously, so the UI shows "Invited" without waiting for the cron.

Direction is decided by the organizer: hosted = organizer is me (or unset);
received = organizer is someone else. The two never collide on one event.
"""

from __future__ import annotations

import logging
from datetime import UTC, datetime
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import or_, select, text
from sqlalchemy.dialects.postgresql import insert as pg_insert
from sqlalchemy.ext.asyncio import AsyncSession

from wild_life import mail
from wild_life.config import settings
from wild_life.db.session import get_session
from wild_life.mail import ics
from wild_life.mail.deps import get_transport
from wild_life.mail.service import Attachment
from wild_life.mail.transport import MailTransport
from wild_life.models.calendar import AttendeeResponse, Event, SentInvite
from wild_life.routers.calendar import reconcile_event_attendees
from wild_life.routers.preferences import load_calendar_prefs
from wild_life.routers.stream import publish_event
from wild_life.schemas.calendar import EventRead
from wild_life.schemas.calendar_mail import (
    GuestStatus,
    MailTickResult,
    RsvpBody,
    SendInvitesResult,
)
from wild_life.schemas.preferences import CalendarPrefs

log = logging.getLogger("wild_life.calendar_mail")

router = APIRouter(prefix="/calendar/mail", tags=["calendar-mail"])
event_invites_router = APIRouter(tags=["calendar-mail"])

_RSVP_PARTSTAT = {
    "accepted": "ACCEPTED",
    "declined": "DECLINED",
    "tentative": "TENTATIVE",
}


# --------------------------------------------------------------------------- #
# helpers
# --------------------------------------------------------------------------- #


def _norm(email: str) -> str:
    return email.strip().lower()


def _addr(value: str | None) -> str:
    return (value or "").replace("mailto:", "").replace("MAILTO:", "").strip()


def _is_hosted(event: Event) -> bool:
    """True when I'm the organizer (or none is set) — I invite others."""
    org = _norm(_addr(event.organizer))
    return not org or org == settings.self_address


def _valid_attendees(event: Event) -> list[str]:
    """Current attendee emails, normalized + de-duplicated, invalids dropped."""
    seen: dict[str, None] = {}
    for raw in event.attendees or []:
        if raw and "@" in raw:
            seen.setdefault(_norm(raw), None)
    return list(seen)


async def _cn_for(session: AsyncSession, email: str) -> str | None:
    """Resolve a Person display name for an attendee email (best-effort)."""
    return (
        await session.execute(
            text(
                "SELECT name FROM wild_life.people WHERE EXISTS ("
                "SELECT 1 FROM jsonb_array_elements(emails) el "
                "WHERE lower(el->>'value') = :email) LIMIT 1"
            ),
            {"email": _norm(email)},
        )
    ).scalar()


def _organizer_addr(prefs: CalendarPrefs) -> str:
    return _norm(prefs.organizer_from) or settings.self_address


async def _ledger(
    session: AsyncSession, event_id: UUID
) -> tuple[dict[str, int], set[str]]:
    """(latest REQUEST sequence per email, emails with any CANCEL) for an event."""
    rows = (
        await session.execute(
            select(
                SentInvite.attendee_email, SentInvite.method, SentInvite.sequence
            ).where(SentInvite.event_id == event_id)
        )
    ).all()
    requested: dict[str, int] = {}
    cancelled: set[str] = set()
    for email, method, seq in rows:
        if method == "REQUEST":
            requested[email] = max(requested.get(email, -1), seq)
        elif method == "CANCEL":
            cancelled.add(email)
    return requested, cancelled


def _signature(event: Event) -> str:
    """The material fields whose change warrants a SEQUENCE bump + resend to all.

    Deliberately excludes the attendee list: adding/removing a guest must not
    re-notify the others (matches Google/Fantastical behaviour)."""
    parts = [
        event.title or "",
        event.start_at.isoformat() if event.start_at else "",
        event.end_at.isoformat() if event.end_at else "",
        event.location or "",
        "1" if event.all_day else "0",
        event.recurrence or "",
    ]
    return "|".join(parts)


def _event_attachment(kind: str, ics_bytes: bytes) -> Attachment:
    return (
        ics_bytes,
        "text",
        "calendar",
        {"method": kind, "charset": "UTF-8"},
        "invite.ics",
    )


async def _send_request(
    session: AsyncSession,
    transport: MailTransport,
    event: Event,
    email: str,
    seq: int,
    prefs: CalendarPrefs,
    organizer: str,
) -> None:
    cn = await _cn_for(session, email)
    body = ics.build_request(
        uid=event.external_ref or "",
        sequence=seq,
        organizer=organizer,
        attendees=[(email, cn)],
        summary=event.title,
        start=event.start_at,
        end=event.end_at,
        all_day=event.all_day,
        description=event.description,
        location=event.location,
        recurrence=event.recurrence,
        recurrence_id=event.recurrence_id,
        request_rsvp=prefs.request_rsvp,
    )
    await mail.send_email(
        transport,
        to=email,
        subject=f"Invitation: {event.title}",
        text_body=f'You\'re invited to "{event.title}".',
        attachments=[_event_attachment("REQUEST", body)],
        from_addr=organizer,
    )
    session.add(
        SentInvite(
            event_id=event.id, attendee_email=email, method="REQUEST", sequence=seq
        )
    )


async def _send_cancel(
    session: AsyncSession,
    transport: MailTransport,
    event: Event,
    email: str,
    seq: int,
    organizer: str,
) -> None:
    body = ics.build_cancel(
        uid=event.external_ref or "",
        sequence=seq,
        organizer=organizer,
        attendees=[(email, None)],
        summary=event.title,
        start=event.start_at,
        end=event.end_at,
        all_day=event.all_day,
        recurrence=event.recurrence,
        recurrence_id=event.recurrence_id,
    )
    await mail.send_email(
        transport,
        to=email,
        subject=f"Cancelled: {event.title}",
        text_body=f'"{event.title}" has been cancelled.',
        attachments=[_event_attachment("CANCEL", body)],
        from_addr=organizer,
    )
    session.add(
        SentInvite(
            event_id=event.id, attendee_email=email, method="CANCEL", sequence=seq
        )
    )


async def process_hosted_event(
    session: AsyncSession,
    transport: MailTransport,
    event: Event,
    prefs: CalendarPrefs,
) -> tuple[int, int]:
    """Send pending REQUEST/CANCEL for one hosted event. Returns (requests, cancels).

    Idempotent: a guest is (re)invited only when they lack a REQUEST at the
    event's current sequence; a change since the last send bumps the sequence so
    everyone gets an update; removed guests and cancelled events get a CANCEL.
    """
    organizer = _organizer_addr(prefs)
    if not event.external_ref:
        event.external_ref = f"{event.id}@wild-life"
    if not event.organizer:
        event.organizer = f"mailto:{organizer}"

    requested, cancelled = await _ledger(session, event.id)
    requests_sent = cancels_sent = 0

    # --- Cancellation: withdraw from every guest still holding an invite. ---
    if event.cancelled_at is not None:
        seq = (event.sequence or 0) + 1
        for email in list(requested):
            if email in cancelled:
                continue
            await _send_cancel(session, transport, event, email, seq, organizer)
            cancels_sent += 1
        # Everyone's been cancelled (or nobody was ever invited) → purge.
        await session.flush()
        await session.delete(event)
        return requests_sent, cancels_sent

    if not event.invites_enabled:
        return 0, 0

    current = _valid_attendees(event)
    sig = _signature(event)

    # A material change (time/place/title) since the last send bumps the
    # sequence so every current guest gets an update; a guest-list-only change
    # leaves the signature (and everyone else's invite) untouched.
    if (
        requested
        and event.invite_signature is not None
        and event.invite_signature != sig
    ):
        event.sequence = (event.sequence or 0) + 1

    seq = event.sequence or 0

    # --- REQUEST to guests not yet invited at this sequence. ---
    for email in current:
        if requested.get(email, -1) >= seq:
            continue
        await _send_request(session, transport, event, email, seq, prefs, organizer)
        requests_sent += 1

    # --- CANCEL to guests dropped from the list. ---
    for email in requested:
        if email in current or email in cancelled:
            continue
        await _send_cancel(session, transport, event, email, seq, organizer)
        cancels_sent += 1

    # Record the material snapshot we've now sent (first send or after a bump).
    if requests_sent or event.invite_signature is None:
        event.invite_signature = sig

    return requests_sent, cancels_sent


async def _send_reply(
    session: AsyncSession,
    transport: MailTransport,
    event: Event,
    status_value: str,
) -> None:
    partstat = _RSVP_PARTSTAT[status_value]
    organizer_email = _addr(event.organizer)
    body = ics.build_reply(
        uid=event.external_ref or "",
        sequence=event.sequence or 0,
        organizer=event.organizer,
        attendee_addr=settings.self_address,
        partstat=partstat,
        summary=event.title,
        start=event.start_at,
        end=event.end_at,
    )
    verb = status_value.capitalize()
    await mail.send_email(
        transport,
        to=organizer_email,
        subject=f"{verb}: {event.title}",
        text_body=f'{settings.self_address} has {status_value} the invitation "{event.title}".',
        attachments=[_event_attachment("REPLY", body)],
    )
    event.rsvp_sent_status = status_value


# --------------------------------------------------------------------------- #
# inbound ingest
# --------------------------------------------------------------------------- #


async def _event_by_ref(session: AsyncSession, uid: str) -> Event | None:
    return (
        await session.execute(select(Event).where(Event.external_ref == uid))
    ).scalar_one_or_none()


async def _ingest_request(session: AsyncSession, parsed: ics.ParsedEvent) -> bool:
    """Create/update a received invite. Returns True if something changed."""
    payload = parsed.payload
    if not payload:
        return False
    existing = await _event_by_ref(session, payload["external_ref"])
    if existing is None:
        event = Event(
            title=payload["title"],
            description=payload.get("description"),
            location=payload.get("location"),
            start_at=datetime.fromisoformat(payload["start_at"]),
            end_at=(
                datetime.fromisoformat(payload["end_at"])
                if payload.get("end_at")
                else None
            ),
            all_day=payload.get("all_day", False),
            external_ref=payload["external_ref"],
            organizer=payload.get("organizer"),
            sequence=payload.get("sequence"),
            rsvp_status=payload.get("rsvp_status"),
        )
        session.add(event)
        return True
    if not existing.organizer:
        # Already imported from the calendar; the invite makes it respondable.
        existing.organizer = payload.get("organizer")
        existing.sequence = payload.get("sequence")
        existing.rsvp_status = payload.get("rsvp_status")
        return True
    if (existing.sequence or 0) < (payload.get("sequence") or 0):
        existing.title = payload["title"]
        existing.description = payload.get("description")
        existing.location = payload.get("location")
        existing.start_at = datetime.fromisoformat(payload["start_at"])
        existing.end_at = (
            datetime.fromisoformat(payload["end_at"]) if payload.get("end_at") else None
        )
        existing.all_day = payload.get("all_day", False)
        existing.sequence = payload.get("sequence")
        return True
    return False


async def _ingest_cancel(session: AsyncSession, parsed: ics.ParsedEvent) -> bool:
    existing = await _event_by_ref(session, parsed.uid)
    if existing is not None:
        await session.delete(existing)
        return True
    return False


async def _ingest_reply(session: AsyncSession, parsed: ics.ParsedEvent) -> int:
    """Upsert per-guest responses onto the hosted event. Returns rows changed."""
    uid = parsed.uid.split("::", 1)[0]
    event = await _event_by_ref(session, uid)
    if event is None:
        return 0
    changed = 0
    now = datetime.now(UTC)
    for att in parsed.attendees:
        if not att.partstat:
            continue
        stmt = (
            pg_insert(AttendeeResponse)
            .values(
                event_id=event.id,
                attendee_email=_norm(att.email),
                partstat=att.partstat,
                sequence=parsed.sequence,
                responded_at=now,
            )
            .on_conflict_do_update(
                constraint="uq_attendee_response",
                set_={
                    "partstat": att.partstat,
                    "sequence": parsed.sequence,
                    "responded_at": now,
                },
            )
        )
        await session.execute(stmt)
        changed += 1
    return changed


# --------------------------------------------------------------------------- #
# endpoints
# --------------------------------------------------------------------------- #


async def run_mail_tick(
    session: AsyncSession, transport: MailTransport
) -> MailTickResult:
    """One pass of the two-way sync. Shared by the in-process poll loop and the
    manual `/calendar/mail/tick` endpoint. Flushes but does not commit — the
    caller owns the transaction."""
    if not mail.is_enabled():
        return MailTickResult(disabled=True)

    prefs = await load_calendar_prefs(session)
    result = MailTickResult()
    changed_event_ids: set[str] = set()

    # 1 + 2. Outbound for every event carrying invite state or an RSVP to relay.
    events = (
        (
            await session.execute(
                select(Event).where(
                    or_(
                        Event.invites_enabled.is_(True),
                        Event.cancelled_at.isnot(None),
                        Event.organizer.isnot(None),
                    )
                )
            )
        )
        .scalars()
        .all()
    )
    for event in events:
        try:
            if _is_hosted(event):
                if event.invites_enabled or event.cancelled_at is not None:
                    req, can = await process_hosted_event(
                        session, transport, event, prefs
                    )
                    result.requests_sent += req
                    result.cancels_sent += can
                    if req or can:
                        changed_event_ids.add(str(event.id))
            else:
                status_value = (event.rsvp_status or "").lower()
                if (
                    status_value in _RSVP_PARTSTAT
                    and status_value != (event.rsvp_sent_status or "").lower()
                    and event.organizer
                ):
                    await _send_reply(session, transport, event, status_value)
                    result.replies_sent += 1
                    changed_event_ids.add(str(event.id))
        except Exception:  # noqa: BLE001 — one bad event never aborts the tick
            log.exception("outbound mail failed for event %s", event.id)
            result.errors += 1

    # 3. Inbound IMAP.
    try:
        messages = await mail.fetch_messages(
            transport, settings.mail_mailbox, settings.mail_keyword
        )
    except Exception:  # noqa: BLE001 — IMAP hiccup shouldn't fail the whole tick
        log.exception("IMAP fetch failed")
        messages = []
        result.errors += 1

    for fetched in messages:
        handled = False
        for part in ics.calendar_parts_from_message(fetched.message):
            for parsed in ics.parse_calendar(part):
                try:
                    if parsed.method == "REPLY":
                        n = await _ingest_reply(session, parsed)
                        result.responses_ingested += n
                        handled = handled or n > 0
                    elif parsed.method == "CANCEL":
                        if await _ingest_cancel(session, parsed):
                            result.invites_ingested += 1
                        handled = True
                    elif parsed.method in ("", "REQUEST"):
                        if await _ingest_request(session, parsed):
                            result.invites_ingested += 1
                        handled = True
                except Exception:  # noqa: BLE001
                    log.exception("ingest failed for uid %s", parsed.uid)
                    result.errors += 1
        if handled:
            try:
                await mail.mark_handled(
                    transport,
                    settings.mail_mailbox,
                    fetched.imap_id,
                    settings.mail_keyword,
                )
            except Exception:  # noqa: BLE001
                log.debug("mark_handled failed", exc_info=True)

    await session.flush()
    for eid in changed_event_ids:
        await publish_event("calendar_mail", {"entity": "event", "id": eid})
    if result.invites_ingested or result.responses_ingested:
        await publish_event("calendar_mail", {"entity": "event"})
    return result


@router.post("/tick", response_model=MailTickResult, operation_id="calendar_mail_tick")
async def tick(
    session: AsyncSession = Depends(get_session),
    transport: MailTransport = Depends(get_transport),
) -> MailTickResult:
    """Manual trigger for the sync (also runs automatically in-process — see the
    poll loop in ``mail.scheduler``). Handy for testing and one-off pokes."""
    return await run_mail_tick(session, transport)


@event_invites_router.post(
    "/events/{event_id}/invites/send",
    response_model=SendInvitesResult,
    operation_id="events_send_invites",
)
async def send_invites(
    event_id: UUID,
    session: AsyncSession = Depends(get_session),
    transport: MailTransport = Depends(get_transport),
) -> SendInvitesResult:
    """Opt an event into invites and send its pending REQUEST/CANCEL now."""
    event = await session.get(Event, event_id)
    if event is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, detail="Not found")
    if not _is_hosted(event):
        raise HTTPException(status.HTTP_400_BAD_REQUEST, detail="Not a hosted event")

    # Keep attendee↔person links fresh so CN resolution works.
    await reconcile_event_attendees(session, event)
    if event.cancelled_at is None:
        event.invites_enabled = True

    if not mail.is_enabled():
        await session.flush()
        return SendInvitesResult(disabled=True)

    prefs = await load_calendar_prefs(session)
    req, can = await process_hosted_event(session, transport, event, prefs)
    await session.flush()
    await publish_event("calendar_mail", {"entity": "event", "id": str(event_id)})
    return SendInvitesResult(requests_sent=req, cancels_sent=can)


@event_invites_router.post(
    "/events/{event_id}/rsvp",
    response_model=EventRead,
    operation_id="events_rsvp",
)
async def set_rsvp(
    event_id: UUID,
    body: RsvpBody,
    session: AsyncSession = Depends(get_session),
    transport: MailTransport = Depends(get_transport),
) -> Event:
    """Set my RSVP to a received invite and email the METHOD:REPLY immediately
    (no waiting for the poll). The poll remains the safety net if mail is off."""
    event = await session.get(Event, event_id)
    if event is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, detail="Not found")
    if not event.organizer or _is_hosted(event):
        raise HTTPException(
            status.HTTP_400_BAD_REQUEST, detail="Not a received invite"
        )

    event.rsvp_status = body.status
    status_value = body.status.lower()
    if (
        mail.is_enabled()
        and status_value in _RSVP_PARTSTAT
        and status_value != (event.rsvp_sent_status or "").lower()
    ):
        await _send_reply(session, transport, event, status_value)

    await session.flush()
    await session.refresh(event)
    await publish_event("calendar_mail", {"entity": "event", "id": str(event_id)})
    return event


@event_invites_router.get(
    "/events/{event_id}/guests",
    response_model=list[GuestStatus],
    operation_id="events_guests",
)
async def event_guests(
    event_id: UUID, session: AsyncSession = Depends(get_session)
) -> list[GuestStatus]:
    """Per-guest invite + RSVP status for a hosted event (drives the UI panel)."""
    event = await session.get(Event, event_id)
    if event is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, detail="Not found")

    requested, _ = await _ledger(session, event.id)
    responses = {
        r.attendee_email: r.partstat
        for r in (
            await session.execute(
                select(AttendeeResponse).where(AttendeeResponse.event_id == event.id)
            )
        ).scalars()
    }
    out: list[GuestStatus] = []
    for email in _valid_attendees(event):
        out.append(
            GuestStatus(
                email=email,
                name=await _cn_for(session, email),
                invited=email in requested,
                partstat=responses.get(email),
            )
        )
    return out
