"""iCalendar (iMIP) building + parsing — the calendar-specific concern.

Builders emit RFC-5545 VCALENDAR bytes for the three methods we send:
REQUEST (host an event / send an update), CANCEL (withdraw), REPLY (respond to a
received invite — ported from the calendar-mail sidecar). ``parse_calendar``
reads the reverse: inbound REQUEST/CANCEL (invites I received) and REPLY
(attendee responses to events I host).

All DATE-TIME values are serialized as UTC (``…Z``) so no VTIMEZONE is needed;
all-day events use DATE values.
"""

from __future__ import annotations

from dataclasses import dataclass, field
from datetime import UTC, date, datetime, time
from typing import Any

from icalendar import Calendar, Event, vCalAddress, vText

from wild_life.richtext import normalize_description

PRODID = "-//wild-life//calendar//EN"


# --------------------------------------------------------------------------- #
# helpers
# --------------------------------------------------------------------------- #


def _aware(value: Any) -> datetime:
    """Coerce a date/datetime to a tz-aware datetime (assume UTC if naive)."""
    if isinstance(value, datetime):
        return value if value.tzinfo else value.replace(tzinfo=UTC)
    if isinstance(value, date):
        return datetime.combine(value, time.min, tzinfo=UTC)
    raise TypeError(f"unhandled date type {type(value)!r}")


def _addr(value: Any) -> str:
    """A CAL-ADDRESS ('mailto:x@y' / 'MAILTO:x@y') → bare email."""
    return str(value).replace("mailto:", "").replace("MAILTO:", "").strip()


def _cal_address(email: str, cn: str | None = None) -> vCalAddress:
    addr = vCalAddress(f"mailto:{_addr(email)}")
    if cn:
        addr.params["CN"] = vText(cn)
    return addr


def _add_when(
    comp: Event, start: datetime, end: datetime | None, all_day: bool
) -> None:
    """Add DTSTART/DTEND, as DATE for all-day or UTC DATE-TIME otherwise."""
    if all_day:
        comp.add("dtstart", _aware(start).date())
        if end is not None:
            comp.add("dtend", _aware(end).date())
    else:
        comp.add("dtstart", _aware(start).astimezone(UTC))
        if end is not None:
            comp.add("dtend", _aware(end).astimezone(UTC))


def _base_calendar(method: str) -> Calendar:
    cal = Calendar()
    cal.add("prodid", PRODID)
    cal.add("version", "2.0")
    cal.add("method", method)
    return cal


# --------------------------------------------------------------------------- #
# builders
# --------------------------------------------------------------------------- #


def build_request(
    *,
    uid: str,
    sequence: int,
    organizer: str,
    organizer_cn: str | None = None,
    attendees: list[tuple[str, str | None]],
    summary: str,
    start: datetime,
    end: datetime | None = None,
    all_day: bool = False,
    description: str | None = None,
    location: str | None = None,
    recurrence: str | None = None,
    recurrence_id: datetime | None = None,
    request_rsvp: bool = True,
    now: datetime | None = None,
) -> bytes:
    """A METHOD:REQUEST invite for ``attendees`` — initial send or an update."""
    cal = _base_calendar("REQUEST")
    comp = Event()
    comp.add("uid", uid)
    comp.add("sequence", sequence)
    comp.add("dtstamp", (now or datetime.now(UTC)).astimezone(UTC))
    _add_when(comp, start, end, all_day)
    comp.add("summary", summary or "")
    if description:
        comp.add("description", description)
    if location:
        comp.add("location", location)
    if recurrence:
        comp.add("rrule", _parse_rrule(recurrence))
    if recurrence_id is not None:
        comp.add("recurrence-id", _aware(recurrence_id).astimezone(UTC))
    comp.add("organizer", _cal_address(organizer, organizer_cn))
    for email, cn in attendees:
        att = _cal_address(email, cn)
        att.params["ROLE"] = vText("REQ-PARTICIPANT")
        att.params["PARTSTAT"] = vText("NEEDS-ACTION")
        if request_rsvp:
            att.params["RSVP"] = vText("TRUE")
        comp.add("attendee", att, encode=0)  # type: ignore[call-overload]
    cal.add_component(comp)
    return cal.to_ical()


def build_cancel(
    *,
    uid: str,
    sequence: int,
    organizer: str,
    organizer_cn: str | None = None,
    attendees: list[tuple[str, str | None]],
    summary: str,
    start: datetime,
    end: datetime | None = None,
    all_day: bool = False,
    recurrence: str | None = None,
    recurrence_id: datetime | None = None,
    now: datetime | None = None,
) -> bytes:
    """A METHOD:CANCEL withdrawing the event from ``attendees``."""
    cal = _base_calendar("CANCEL")
    comp = Event()
    comp.add("uid", uid)
    comp.add("sequence", sequence)
    comp.add("status", "CANCELLED")
    comp.add("dtstamp", (now or datetime.now(UTC)).astimezone(UTC))
    _add_when(comp, start, end, all_day)
    comp.add("summary", summary or "")
    if recurrence:
        comp.add("rrule", _parse_rrule(recurrence))
    if recurrence_id is not None:
        comp.add("recurrence-id", _aware(recurrence_id).astimezone(UTC))
    comp.add("organizer", _cal_address(organizer, organizer_cn))
    for email, cn in attendees:
        comp.add("attendee", _cal_address(email, cn), encode=0)  # type: ignore[call-overload]
    cal.add_component(comp)
    return cal.to_ical()


def build_reply(
    *,
    uid: str,
    sequence: int,
    organizer: str | None,
    attendee_addr: str,
    partstat: str,
    summary: str,
    start: datetime,
    end: datetime | None = None,
    now: datetime | None = None,
) -> bytes:
    """A METHOD:REPLY to a received invite (ported from calendar-mail)."""
    cal = _base_calendar("REPLY")
    comp = Event()
    # A "::<recurrence-id>" suffix marks an override — the reply keys off the
    # bare UID.
    comp.add("uid", uid.split("::", 1)[0])
    comp.add("sequence", sequence or 0)
    comp.add("dtstamp", (now or datetime.now(UTC)).astimezone(UTC))
    comp.add("dtstart", _aware(start).astimezone(UTC))
    if end is not None:
        comp.add("dtend", _aware(end).astimezone(UTC))
    comp.add("summary", summary or "")
    if organizer:
        comp.add("organizer", _cal_address(organizer))
    att = _cal_address(attendee_addr, attendee_addr)
    att.params["PARTSTAT"] = vText(partstat)
    comp.add("attendee", att, encode=0)  # type: ignore[call-overload]
    cal.add_component(comp)
    return cal.to_ical()


def _parse_rrule(recurrence: str) -> Any:
    """Turn a stored raw RRULE string ('FREQ=WEEKLY;BYDAY=TU') into the dict
    icalendar wants for ``comp.add('rrule', …)``."""
    from icalendar.prop import vRecur

    return vRecur.from_ical(recurrence.removeprefix("RRULE:"))


# --------------------------------------------------------------------------- #
# parsing (inbound)
# --------------------------------------------------------------------------- #


@dataclass
class ParsedAttendee:
    email: str
    partstat: str | None


@dataclass
class ParsedEvent:
    """One VEVENT lifted from an inbound message, method-tagged."""

    method: str  # REQUEST | CANCEL | REPLY | ""
    uid: str
    sequence: int | None
    organizer: str | None
    payload: dict[str, Any] = field(default_factory=dict)
    attendees: list[ParsedAttendee] = field(default_factory=list)


def _vevent_payload(vevent: Any) -> dict[str, Any] | None:
    """Event-create fields from a VEVENT (mirrors calendar-mail.vevent_to_payload)."""
    uid = str(vevent.get("UID") or "").strip()
    dtstart = vevent.get("DTSTART")
    if not uid or dtstart is None:
        return None
    start = _aware(dtstart.dt)
    all_day = isinstance(dtstart.dt, date) and not isinstance(dtstart.dt, datetime)
    end = None
    if vevent.get("DTEND") is not None:
        end = _aware(vevent.get("DTEND").dt)
    organizer = vevent.get("ORGANIZER")
    seq = vevent.get("SEQUENCE")

    def s(name: str) -> str | None:
        v = vevent.get(name)
        return str(v) if v is not None else None

    return {
        "title": s("SUMMARY") or "(untitled invite)",
        # Senders put HTML in DESCRIPTION (Google) or leave it empty and carry the
        # body in X-ALT-DESC (Outlook); both become plain text here so the stored
        # column has one form. See wild_life.richtext.
        "description": normalize_description(s("DESCRIPTION"))
        or _alt_description(vevent),
        "location": s("LOCATION"),
        "start_at": start.isoformat(),
        "end_at": end.isoformat() if end else None,
        "all_day": all_day,
        "external_ref": uid,
        "organizer": str(organizer) if organizer is not None else None,
        "sequence": int(seq.to_ical()) if seq is not None else None,
        "rsvp_status": "needs-action",
    }


def _alt_description(vevent: Any) -> str | None:
    """Outlook's HTML alternate body — only consulted when DESCRIPTION is empty.

    Never preferred over a populated DESCRIPTION: when a sender emits both, that
    one is the plain-text twin and this is the markup. Guarded twice — the
    FMTTYPE must say HTML, and the content itself must look like it.
    """
    raw = vevent.get("X-ALT-DESC")
    if raw is None:
        return None
    fmt = str((getattr(raw, "params", {}) or {}).get("FMTTYPE") or "").lower()
    if fmt and "html" not in fmt:
        return None
    return normalize_description(str(raw)) or None


def _attendees(vevent: Any) -> list[ParsedAttendee]:
    raw = vevent.get("ATTENDEE")
    if raw is None:
        return []
    items = raw if isinstance(raw, list) else [raw]
    out: list[ParsedAttendee] = []
    for a in items:
        email = _addr(a)
        if not email:
            continue
        params = getattr(a, "params", {}) or {}
        partstat = params.get("PARTSTAT")
        out.append(
            ParsedAttendee(
                email=email, partstat=str(partstat).lower() if partstat else None
            )
        )
    return out


def parse_calendar(raw: bytes) -> list[ParsedEvent]:
    """Every VEVENT across all text/calendar parts of a raw message part."""
    try:
        cal = Calendar.from_ical(raw.decode("utf-8", "replace"))
    except (ValueError, TypeError):
        return []
    method = str(cal.get("METHOD") or "").upper()
    out: list[ParsedEvent] = []
    for vevent in cal.walk("VEVENT"):
        uid = str(vevent.get("UID") or "").strip()
        if not uid:
            continue
        seq = vevent.get("SEQUENCE")
        organizer = vevent.get("ORGANIZER")
        out.append(
            ParsedEvent(
                method=method,
                uid=uid,
                sequence=int(seq.to_ical()) if seq is not None else None,
                organizer=str(organizer) if organizer is not None else None,
                payload=_vevent_payload(vevent) or {},
                attendees=_attendees(vevent),
            )
        )
    return out


def calendar_parts_from_message(msg: Any) -> list[bytes]:
    """Raw bytes of every text/calendar part in an email message."""
    out: list[bytes] = []
    for part in msg.walk():
        if part.get_content_type() != "text/calendar":
            continue
        payload = part.get_payload(decode=True)
        if isinstance(payload, (bytes, bytearray)):
            out.append(bytes(payload))
    return out
