"""Golden-ish tests for the iMIP builders/parser (pure — no DB, no network)."""

from datetime import UTC, datetime

from wild_life.mail import ics

START = datetime(2026, 8, 1, 15, 0, tzinfo=UTC)
END = datetime(2026, 8, 1, 16, 0, tzinfo=UTC)
NOW = datetime(2026, 7, 22, 12, 0, tzinfo=UTC)


def _unfold(ics_bytes: bytes) -> str:
    """Undo RFC-5545 line folding so substring assertions are robust."""
    return ics_bytes.decode().replace("\r\n ", "").replace("\n ", "")


def test_build_request_has_imip_essentials() -> None:
    out = _unfold(
        ics.build_request(
            uid="evt-1@wild-life",
            sequence=0,
            organizer="paul@payne.io",
            organizer_cn="Paul",
            attendees=[("alice@x.com", "Alice"), ("bob@y.com", None)],
            summary="Sync",
            start=START,
            end=END,
            description="agenda",
            location="Room 1",
            recurrence="FREQ=WEEKLY;BYDAY=TU",
            now=NOW,
        )
    )
    assert "METHOD:REQUEST" in out
    assert "UID:evt-1@wild-life" in out
    assert "SEQUENCE:0" in out
    assert "ORGANIZER;CN=Paul:mailto:paul@payne.io" in out
    assert "RRULE:FREQ=WEEKLY;BYDAY=TU" in out
    assert "DTSTART:20260801T150000Z" in out
    assert "DTEND:20260801T160000Z" in out
    # each attendee opted-in for RSVP + needs-action
    assert out.count("RSVP=TRUE") == 2
    assert out.count("PARTSTAT=NEEDS-ACTION") == 2
    assert "mailto:alice@x.com" in out
    assert "mailto:bob@y.com" in out


def test_build_request_respects_rsvp_flag() -> None:
    out = _unfold(
        ics.build_request(
            uid="u",
            sequence=1,
            organizer="paul@payne.io",
            attendees=[("a@x.com", None)],
            summary="No RSVP",
            start=START,
            request_rsvp=False,
            now=NOW,
        )
    )
    assert "RSVP=TRUE" not in out


def test_build_request_all_day_uses_date_value() -> None:
    out = _unfold(
        ics.build_request(
            uid="u",
            sequence=0,
            organizer="paul@payne.io",
            attendees=[("a@x.com", None)],
            summary="Holiday",
            start=START,
            all_day=True,
            now=NOW,
        )
    )
    assert "DTSTART;VALUE=DATE:20260801" in out
    assert "T150000" not in out


def test_build_cancel_is_cancelled() -> None:
    out = _unfold(
        ics.build_cancel(
            uid="u",
            sequence=2,
            organizer="paul@payne.io",
            attendees=[("a@x.com", None)],
            summary="Sync",
            start=START,
            end=END,
            now=NOW,
        )
    )
    assert "METHOD:CANCEL" in out
    assert "STATUS:CANCELLED" in out
    assert "SEQUENCE:2" in out


def test_build_reply_carries_partstat() -> None:
    out = _unfold(
        ics.build_reply(
            uid="u::20260801",
            sequence=3,
            organizer="mailto:host@corp.com",
            attendee_addr="paul@payne.io",
            partstat="ACCEPTED",
            summary="Their meeting",
            start=START,
            now=NOW,
        )
    )
    assert "METHOD:REPLY" in out
    assert "PARTSTAT=ACCEPTED" in out
    # the "::override" suffix is stripped from the reply UID
    assert "UID:u" in out and "UID:u::" not in out


def test_parse_request_roundtrip() -> None:
    raw = ics.build_request(
        uid="evt-1@wild-life",
        sequence=5,
        organizer="paul@payne.io",
        attendees=[("alice@x.com", "Alice")],
        summary="Sync",
        start=START,
        end=END,
        now=NOW,
    )
    parsed = ics.parse_calendar(raw)
    assert len(parsed) == 1
    pe = parsed[0]
    assert pe.method == "REQUEST"
    assert pe.uid == "evt-1@wild-life"
    assert pe.sequence == 5
    assert pe.payload["title"] == "Sync"
    assert pe.payload["start_at"].startswith("2026-08-01T15:00")
    assert [a.email for a in pe.attendees] == ["alice@x.com"]


def test_parse_reply_extracts_partstat() -> None:
    raw = ics.build_reply(
        uid="evt-1@wild-life",
        sequence=0,
        organizer="mailto:paul@payne.io",
        attendee_addr="guest@x.com",
        partstat="DECLINED",
        summary="Sync",
        start=START,
        now=NOW,
    )
    parsed = ics.parse_calendar(raw)
    assert parsed[0].method == "REPLY"
    assert parsed[0].attendees[0].email == "guest@x.com"
    assert parsed[0].attendees[0].partstat == "declined"


# --------------------------------------------------------------------------- #
# DESCRIPTION — normalized on the way in, echoed verbatim on the way out
# --------------------------------------------------------------------------- #


def _vcalendar(*lines: str) -> bytes:
    """A minimal REQUEST VCALENDAR, for properties the builders can't emit."""
    return "\r\n".join(
        [
            "BEGIN:VCALENDAR",
            "VERSION:2.0",
            "PRODID:-//test//EN",
            "METHOD:REQUEST",
            "BEGIN:VEVENT",
            "UID:alt-desc@corp.com",
            "DTSTART:20260801T150000Z",
            "SUMMARY:Sync",
            *lines,
            "END:VEVENT",
            "END:VCALENDAR",
            "",
        ]
    ).encode()


def test_build_request_emits_description() -> None:
    out = _unfold(
        ics.build_request(
            uid="evt-1@wild-life",
            sequence=0,
            organizer="paul@payne.io",
            attendees=[("alice@x.com", None)],
            summary="Sync",
            start=START,
            description="agenda",
            now=NOW,
        )
    )
    assert "DESCRIPTION:agenda" in out


def test_parse_request_converts_html_description() -> None:
    raw = ics.build_request(
        uid="evt-1@wild-life",
        sequence=0,
        organizer="paul@payne.io",
        attendees=[("alice@x.com", None)],
        summary="Sync",
        start=START,
        description=(
            "Join with Google Meet: "
            '<a href="https://meet.google.com/abc-defg-hij">abc-defg-hij</a>'
            "<br>Dial-in: +1 555-0100"
        ),
        now=NOW,
    )
    desc = ics.parse_calendar(raw)[0].payload["description"]
    assert "<a " not in desc and "<br>" not in desc
    assert "https://meet.google.com/abc-defg-hij" in desc
    assert "Dial-in: +1 555-0100" in desc


def test_parse_request_preserves_plaintext_angle_url() -> None:
    """An HTML parser would eat `<https://…>`; a plain body must survive intact."""
    body = (
        "Microsoft Teams meeting\n"
        "Join: https://teams.microsoft.com/meet/2744040958\n"
        "Need help?<https://aka.ms/JoinTeamsMeeting>"
    )
    raw = ics.build_request(
        uid="evt-1@wild-life",
        sequence=0,
        organizer="paul@payne.io",
        attendees=[("alice@x.com", None)],
        summary="Sync",
        start=START,
        description=body,
        now=NOW,
    )
    assert ics.parse_calendar(raw)[0].payload["description"] == body


def test_x_alt_desc_used_only_when_description_is_empty() -> None:
    alt = "X-ALT-DESC;FMTTYPE=text/html:<html><body><p>Agenda</p></body></html>"

    empty = ics.parse_calendar(_vcalendar("DESCRIPTION:", alt))
    assert empty[0].payload["description"] == "Agenda"

    both = ics.parse_calendar(_vcalendar("DESCRIPTION:the plain twin", alt))
    assert both[0].payload["description"] == "the plain twin"


def test_x_alt_desc_ignored_when_fmttype_is_not_html() -> None:
    parsed = ics.parse_calendar(
        _vcalendar("DESCRIPTION:", "X-ALT-DESC;FMTTYPE=text/plain:not markup")
    )
    assert not parsed[0].payload["description"]
