"""TZID survives import, and a recurring invitation arrives recurring.

Both were being dropped, and both are the same class of loss: the wire says
something our model needs and the parser did not read it. A 9am series stored as
a UTC instant is an hour wrong for half the year (`test_rules.py` proves the
arithmetic); a recurring invitation stored as one meeting is fifty-one meetings
short.
"""

from __future__ import annotations

import sys
from datetime import UTC, datetime
from pathlib import Path

import icalendar

from wild_life.mail import ics

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "scripts"))
from import_ics import vevent_to_payload  # noqa: E402

ZONE = "America/Los_Angeles"


def vevent(*, recurring: bool, tzid: str | None) -> icalendar.Event:
    from zoneinfo import ZoneInfo

    ev = icalendar.Event()
    ev.add("UID", "ZZ-tzid@example.com")
    ev.add("SUMMARY", "Standup")
    start = datetime(2026, 10, 25, 9, 0, tzinfo=ZoneInfo(tzid) if tzid else UTC)
    ev.add("DTSTART", start)
    ev.add("DTEND", start.replace(hour=10))
    if tzid:
        # icalendar writes the TZID parameter from the tzinfo; assert it did,
        # since the whole test rests on that parameter being present.
        assert ev["DTSTART"].params.get("TZID") == tzid
    if recurring:
        ev.add("RRULE", {"FREQ": "WEEKLY", "BYDAY": ["SU"]})
    return ev


class TestTheCalendarImport:
    def test_a_recurring_series_records_the_zone_it_was_written_in(self) -> None:
        payload = vevent_to_payload(vevent(recurring=True, tzid=ZONE), UTC)
        assert payload is not None
        assert payload["timezone"] == ZONE

    def test_a_single_event_claims_no_zone(self) -> None:
        """Its instant is exact; a zone would be recording a spelling, not a fact."""
        payload = vevent_to_payload(vevent(recurring=False, tzid=ZONE), UTC)
        assert payload is not None
        assert payload["timezone"] is None

    def test_a_floating_or_utc_series_records_none(self) -> None:
        payload = vevent_to_payload(vevent(recurring=True, tzid=None), UTC)
        assert payload is not None
        assert payload["timezone"] in (None, "UTC")


class TestTheInvitePath:
    """`mail/ics.py` has always *written* RRULE on the way out and never read one
    on the way in, so a recurring invitation arrived as a single meeting."""

    def test_a_recurring_invitation_keeps_its_rule(self) -> None:
        payload = ics._vevent_payload(vevent(recurring=True, tzid=ZONE))
        assert payload is not None
        assert payload["recurrence"] == "FREQ=WEEKLY;BYDAY=SU"

    def test_and_the_zone_that_rule_is_expressed_in(self) -> None:
        payload = ics._vevent_payload(vevent(recurring=True, tzid=ZONE))
        assert payload is not None
        assert payload["timezone"] == ZONE

    def test_a_single_invitation_is_unchanged(self) -> None:
        payload = ics._vevent_payload(vevent(recurring=False, tzid=ZONE))
        assert payload is not None
        assert payload["recurrence"] is None
        assert payload["timezone"] is None
