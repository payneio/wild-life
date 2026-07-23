"""Tests for the generic mail service (pure — FakeTransport, no network)."""

import asyncio

from tests._fake_mail import FakeTransport
from wild_life.mail import service


def test_build_message_sets_ics_part() -> None:
    msg = service.build_message(
        to="a@x.com",
        subject="Invitation: Sync",
        text_body="hi",
        attachments=[
            (b"BEGIN:VCALENDAR", "text", "calendar", {"method": "REQUEST"}, "i.ics")
        ],
    )
    assert msg["To"] == "a@x.com"
    assert msg["Subject"] == "Invitation: Sync"
    cal = [p for p in msg.walk() if p.get_content_type() == "text/calendar"]
    assert len(cal) == 1
    assert cal[0].get_param("method") == "REQUEST"


def test_send_email_uses_transport() -> None:
    fake = FakeTransport()
    asyncio.run(
        service.send_email(
            fake,
            to="a@x.com",
            subject="s",
            text_body="b",
            attachments=[(b"X", "text", "calendar", {"method": "REQUEST"}, "i.ics")],
        )
    )
    assert len(fake.sent) == 1
    assert fake.sent[0]["To"] == "a@x.com"
    assert fake.sent_methods() == ["REQUEST"]


def test_send_email_multiple_recipients() -> None:
    fake = FakeTransport()
    asyncio.run(
        service.send_email(fake, to=["a@x.com", "b@y.com"], subject="s", text_body="b")
    )
    assert fake.sent[0]["To"] == "a@x.com, b@y.com"
