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
from sqlalchemy import select, text
from sqlalchemy.dialects.postgresql import insert as pg_insert
from sqlalchemy.ext.asyncio import AsyncSession

from wild_life import mail
from wild_life.config import settings
from wild_life.db.session import get_session
from wild_life.mail import ics
from wild_life.mail.deps import get_transport
from wild_life.mail.service import Attachment
from wild_life.mail.transport import MailTransport
from wild_life.models.calendar import AttendeeResponse, SentInvite
from wild_life.models.locations import Location
from wild_life.models.moments import CalendarRecord, Moment, MomentLink
from wild_life.occasions import Occasion
from wild_life import occasions
from wild_life.routers.preferences import load_calendar_prefs
from wild_life.routers.stream import publish_event
from wild_life.schemas.moments import MomentRead
from wild_life.schemas.common import format_address
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


def _is_hosted(occ: Occasion) -> bool:
    """True when I'm the organizer (or none is set) — I invite others."""
    org = _norm(_addr(occ.organizer))
    return not org or org == settings.self_address


def _valid_attendees(occ: Occasion) -> list[str]:
    """Current attendee emails, normalized + de-duplicated, invalids dropped."""
    seen: dict[str, None] = {}
    for raw in occ.attendees:
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
    session: AsyncSession, moment_id: UUID
) -> tuple[dict[str, int], set[str]]:
    """(latest REQUEST sequence per email, emails with any CANCEL) for a moment."""
    rows = (
        await session.execute(
            select(
                SentInvite.attendee_email, SentInvite.method, SentInvite.sequence
            ).where(SentInvite.moment_id == moment_id)
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


def _signature(occ: Occasion) -> str:
    """The material fields whose change warrants a SEQUENCE bump + resend to all.

    Deliberately excludes the attendee list: adding/removing a guest must not
    re-notify the others (matches Google/Fantastical behaviour)."""
    parts = [
        occ.title or "",
        occ.start_at.isoformat() if occ.start_at else "",
        occ.end_at.isoformat() if occ.end_at else "",
        occ.location or "",
        "1" if occ.all_day else "0",
        occ.recurrence or "",
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


async def _ics_location(session: AsyncSession, occ: Occasion) -> str | None:
    """What to put in the ICS ``LOCATION`` line.

    iCalendar carries a string, so the reference has to be flattened for the
    wire. When one is set it wins — it is the more considered answer, and it
    stays correct if the place is later renamed — falling back to the free text
    an inbound invite gave us.
    """
    place_id = (
        await session.execute(
            select(MomentLink.entity_id).where(
                MomentLink.moment_id == occ.id,
                MomentLink.role == "place",
                MomentLink.entity_type == "location",
            )
        )
    ).scalar()
    if place_id is None:
        return occ.location
    place = await session.get(Location, place_id)
    if place is None:
        return occ.location
    written = format_address(place)
    return ", ".join(p for p in (place.name, written) if p) or occ.location


async def _send_request(
    session: AsyncSession,
    transport: MailTransport,
    occ: Occasion,
    email: str,
    seq: int,
    prefs: CalendarPrefs,
    organizer: str,
) -> None:
    cn = await _cn_for(session, email)
    body = ics.build_request(
        uid=occ.external_ref or "",
        sequence=seq,
        organizer=organizer,
        attendees=[(email, cn)],
        summary=occ.title,
        start=occ.start_at,
        end=occ.end_at,
        all_day=occ.all_day,
        description=occ.description,
        location=await _ics_location(session, occ),
        recurrence=occ.recurrence,
        recurrence_id=occ.recurrence_id,
        request_rsvp=prefs.request_rsvp,
    )
    await mail.send_email(
        transport,
        to=email,
        subject=f"Invitation: {occ.title}",
        text_body=f'You\'re invited to "{occ.title}".',
        attachments=[_event_attachment("REQUEST", body)],
        from_addr=organizer,
    )
    session.add(
        SentInvite(
            moment_id=occ.id, attendee_email=email, method="REQUEST", sequence=seq
        )
    )


async def _send_cancel(
    session: AsyncSession,
    transport: MailTransport,
    occ: Occasion,
    email: str,
    seq: int,
    organizer: str,
) -> None:
    body = ics.build_cancel(
        uid=occ.external_ref or "",
        sequence=seq,
        organizer=organizer,
        attendees=[(email, None)],
        summary=occ.title,
        start=occ.start_at,
        end=occ.end_at,
        all_day=occ.all_day,
        recurrence=occ.recurrence,
        recurrence_id=occ.recurrence_id,
    )
    await mail.send_email(
        transport,
        to=email,
        subject=f"Cancelled: {occ.title}",
        text_body=f'"{occ.title}" has been cancelled.',
        attachments=[_event_attachment("CANCEL", body)],
        from_addr=organizer,
    )
    session.add(
        SentInvite(
            moment_id=occ.id, attendee_email=email, method="CANCEL", sequence=seq
        )
    )


async def process_hosted_event(
    session: AsyncSession,
    transport: MailTransport,
    occ: Occasion,
    prefs: CalendarPrefs,
) -> tuple[int, int]:
    """Send pending REQUEST/CANCEL for one hosted occasion. Returns (requests, cancels).

    Idempotent: a guest is (re)invited only when they lack a REQUEST at the
    event's current sequence; a change since the last send bumps the sequence so
    everyone gets an update; removed guests and cancelled events get a CANCEL.
    """
    organizer = _organizer_addr(prefs)
    if not occ.record.external_ref:
        occ.record.external_ref = f"{occ.id}@wild-life"
    if not occ.record.organizer:
        occ.record.organizer = f"mailto:{organizer}"

    requested, cancelled = await _ledger(session, occ.id)
    requests_sent = cancels_sent = 0

    # --- Cancellation: withdraw from every guest still holding an invite. ---
    if occ.cancelled_at is not None:
        seq = (occ.sequence or 0) + 1
        for email in list(requested):
            if email in cancelled:
                continue
            await _send_cancel(session, transport, occ, email, seq, organizer)
            cancels_sent += 1
        # Everyone has been told. What is withdrawn is now the *moment* — the
        # projection goes with it, which is what makes it unexportable again.
        await session.flush()
        await session.delete(occ.moment)
        return requests_sent, cancels_sent

    if not occ.invites_enabled:
        return 0, 0

    current = _valid_attendees(occ)
    sig = _signature(occ)

    # A material change (time/place/title) since the last send bumps the
    # sequence so every current guest gets an update; a guest-list-only change
    # leaves the signature (and everyone else's invite) untouched.
    if requested and occ.invite_signature is not None and occ.invite_signature != sig:
        occ.record.sequence = (occ.sequence or 0) + 1

    seq = occ.sequence or 0

    # --- REQUEST to guests not yet invited at this sequence. ---
    for email in current:
        if requested.get(email, -1) >= seq:
            continue
        await _send_request(session, transport, occ, email, seq, prefs, organizer)
        requests_sent += 1

    # --- CANCEL to guests dropped from the list. ---
    for email in requested:
        if email in current or email in cancelled:
            continue
        await _send_cancel(session, transport, occ, email, seq, organizer)
        cancels_sent += 1

    # Record the material snapshot we have now sent (first send or after a bump).
    if requests_sent or occ.invite_signature is None:
        occ.record.invite_signature = sig

    return requests_sent, cancels_sent


async def _send_reply(
    session: AsyncSession,
    transport: MailTransport,
    occ: Occasion,
    status_value: str,
) -> None:
    partstat = _RSVP_PARTSTAT[status_value]
    organizer_email = _addr(occ.organizer)
    body = ics.build_reply(
        uid=occ.external_ref or "",
        sequence=occ.sequence or 0,
        organizer=occ.organizer,
        attendee_addr=settings.self_address,
        partstat=partstat,
        summary=occ.title,
        start=occ.start_at,
        end=occ.end_at,
    )
    verb = status_value.capitalize()
    await mail.send_email(
        transport,
        to=organizer_email,
        subject=f"{verb}: {occ.title}",
        text_body=f'{settings.self_address} has {status_value} the invitation "{occ.title}".',
        attachments=[_event_attachment("REPLY", body)],
    )
    occ.record.rsvp_sent_status = status_value


# --------------------------------------------------------------------------- #
# inbound ingest
# --------------------------------------------------------------------------- #


async def _ingest_request(session: AsyncSession, parsed: ics.ParsedEvent) -> bool:
    """Create or update a received invitation. Returns True if something changed.

    An invitation arrives as two things at once and is stored as two: the meeting
    becomes a `moment`, and what the sender said about it — UID, ORGANIZER,
    SEQUENCE, the RSVP we owe them — becomes its `calendar_record`. Being sent an
    invitation is precisely what gives a moment something to share, so this is
    one of only two places a record is created at all.
    """
    payload = parsed.payload
    if not payload:
        return False

    def when(key: str) -> datetime | None:
        raw = payload.get(key)
        return datetime.fromisoformat(raw) if raw else None

    existing = await occasions.by_ref(session, payload["external_ref"])
    if existing is None:
        moment = Moment(
            kind="occasion",
            title=payload["title"],
            body=payload.get("description") or "",
            started_at=when("start_at"),
            ended_at=when("end_at"),
            all_day=payload.get("all_day", False),
            source="imported",
        )
        session.add(moment)
        await session.flush()
        session.add(
            CalendarRecord(
                moment_id=moment.id,
                external_ref=payload["external_ref"],
                organizer=payload.get("organizer"),
                sequence=payload.get("sequence"),
                rsvp_status=payload.get("rsvp_status"),
                recurrence=payload.get("recurrence"),
                recurrence_exdates=payload.get("recurrence_exdates") or [],
                timezone=payload.get("timezone"),
                location=payload.get("location"),
            )
        )
        return True

    if not existing.organizer:
        # Already on the calendar; the invitation makes it respondable.
        existing.record.organizer = payload.get("organizer")
        existing.record.sequence = payload.get("sequence")
        existing.record.rsvp_status = payload.get("rsvp_status")
        return True

    # A newer SEQUENCE is the sender saying the meeting itself changed.
    if (existing.sequence or 0) < (payload.get("sequence") or 0):
        existing.moment.title = payload["title"]
        existing.moment.body = payload.get("description") or ""
        existing.moment.started_at = when("start_at")
        existing.moment.ended_at = when("end_at")
        existing.moment.all_day = payload.get("all_day", False)
        existing.record.location = payload.get("location")
        existing.record.recurrence = payload.get("recurrence")
        existing.record.recurrence_exdates = payload.get("recurrence_exdates") or []
        existing.record.timezone = payload.get("timezone")
        existing.record.sequence = payload.get("sequence")
        return True
    return False


async def _ingest_cancel(session: AsyncSession, parsed: ics.ParsedEvent) -> bool:
    """The organizer withdrew it. The moment goes, and the projection with it."""
    existing = await occasions.by_ref(session, parsed.uid)
    if existing is not None:
        await session.delete(existing.moment)
        return True
    return False


async def _ingest_reply(session: AsyncSession, parsed: ics.ParsedEvent) -> int:
    """Upsert per-guest responses onto the hosted event. Returns rows changed."""
    uid = parsed.uid.split("::", 1)[0]
    occ = await occasions.by_ref(session, uid)
    if occ is None:
        return 0
    changed = 0
    now = datetime.now(UTC)
    for att in parsed.attendees:
        if not att.partstat:
            continue
        stmt = (
            pg_insert(AttendeeResponse)
            .values(
                moment_id=occ.id,
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
    changed_ids: set[str] = set()

    # 1 + 2. Outbound for everything carrying invite state or an RSVP to relay.
    # The candidate set is bounded by the projection table, not by moments: a
    # moment nobody was told about has nothing to send.
    for occ in await occasions.outbound(session):
        try:
            if _is_hosted(occ):
                if occ.invites_enabled or occ.cancelled_at is not None:
                    req, can = await process_hosted_event(
                        session, transport, occ, prefs
                    )
                    result.requests_sent += req
                    result.cancels_sent += can
                    if req or can:
                        changed_ids.add(str(occ.id))
            else:
                status_value = (occ.rsvp_status or "").lower()
                if (
                    status_value in _RSVP_PARTSTAT
                    and status_value != (occ.rsvp_sent_status or "").lower()
                    and occ.organizer
                ):
                    await _send_reply(session, transport, occ, status_value)
                    result.replies_sent += 1
                    changed_ids.add(str(occ.id))
        except Exception:  # noqa: BLE001 — one bad occasion never aborts the tick
            log.exception("outbound mail failed for moment %s", occ.id)
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
    for mid in changed_ids:
        await publish_event("calendar_mail", {"entity": "moment", "id": mid})
    if result.invites_ingested or result.responses_ingested:
        await publish_event("calendar_mail", {"entity": "moment"})
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
    "/moments/{moment_id}/invites/send",
    response_model=SendInvitesResult,
    operation_id="moments_send_invites",
)
async def send_invites(
    moment_id: UUID,
    session: AsyncSession = Depends(get_session),
    transport: MailTransport = Depends(get_transport),
) -> SendInvitesResult:
    """Share a moment and send its pending REQUEST/CANCEL now.

    **This is where a private moment becomes shareable**, and the only place
    besides an inbound invitation where a calendar record is created. Privacy is
    structural rather than a filter, so it has to be an act: nothing leaves until
    someone performs this one.
    """
    moment = await session.get(Moment, moment_id)
    if moment is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, detail="Not found")
    record = await session.get(CalendarRecord, moment_id)
    if record is None:
        record = CalendarRecord(
            moment_id=moment_id, external_ref=f"{moment_id}@wild-life"
        )
        session.add(record)
        await session.flush()
    occ = Occasion(moment, record)
    if not _is_hosted(occ):
        raise HTTPException(status.HTTP_400_BAD_REQUEST, detail="Not a hosted occasion")

    if occ.cancelled_at is None:
        record.invites_enabled = True

    if not mail.is_enabled():
        await session.flush()
        return SendInvitesResult(disabled=True)

    prefs = await load_calendar_prefs(session)
    req, can = await process_hosted_event(session, transport, occ, prefs)
    await session.flush()
    await publish_event("calendar_mail", {"entity": "moment", "id": str(moment_id)})
    return SendInvitesResult(requests_sent=req, cancels_sent=can)


@event_invites_router.post(
    "/moments/{moment_id}/rsvp",
    response_model=MomentRead,
    operation_id="moments_rsvp",
)
async def set_rsvp(
    moment_id: UUID,
    body: RsvpBody,
    session: AsyncSession = Depends(get_session),
    transport: MailTransport = Depends(get_transport),
) -> MomentRead:
    """Set my RSVP to a received invitation and email the METHOD:REPLY at once
    (no waiting for the poll). The poll remains the safety net if mail is off."""
    occ = await occasions.load(session, moment_id)
    if occ is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, detail="Not found")
    if not occ.organizer or _is_hosted(occ):
        raise HTTPException(
            status.HTTP_400_BAD_REQUEST, detail="Not a received invitation"
        )

    occ.record.rsvp_status = body.status
    status_value = body.status.lower()
    if (
        mail.is_enabled()
        and status_value in _RSVP_PARTSTAT
        and status_value != (occ.rsvp_sent_status or "").lower()
    ):
        await _send_reply(session, transport, occ, status_value)

    await session.flush()
    await session.refresh(occ.moment)
    await publish_event("calendar_mail", {"entity": "moment", "id": str(moment_id)})
    return MomentRead.model_validate(occ.moment)


@event_invites_router.get(
    "/moments/{moment_id}/guests",
    response_model=list[GuestStatus],
    operation_id="moments_guests",
)
async def event_guests(
    moment_id: UUID, session: AsyncSession = Depends(get_session)
) -> list[GuestStatus]:
    """Per-guest invite + RSVP status for a hosted occasion (drives the panel).

    Empty for a moment with no projection, which is the honest answer: nobody was
    told, so there is nobody to have a status.
    """
    occ = await occasions.load(session, moment_id)
    if occ is None:
        return []

    requested, _ = await _ledger(session, occ.id)
    responses = {
        r.attendee_email: r.partstat
        for r in (
            await session.execute(
                select(AttendeeResponse).where(AttendeeResponse.moment_id == occ.id)
            )
        ).scalars()
    }
    out: list[GuestStatus] = []
    for email in _valid_attendees(occ):
        out.append(
            GuestStatus(
                email=email,
                name=await _cn_for(session, email),
                invited=email in requested,
                partstat=responses.get(email),
            )
        )
    return out
