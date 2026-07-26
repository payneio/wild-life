"""Integration tests for the calendar-mail tick (needs the castle Postgres).

Bridge is replaced by a FakeTransport via dependency override, and mail is force
-enabled on the settings object, so nothing touches a real Proton Bridge.
"""

from collections.abc import Generator
from datetime import UTC, datetime

import pytest
from fastapi.testclient import TestClient

from tests._fake_mail import FakeTransport, make_ics_email
from wild_life.config import settings
from wild_life.mail import ics
from wild_life.mail.deps import get_transport
from wild_life.main import app

MARK = "ZZ-mail-test"
START = "2026-09-01T15:00:00+00:00"
END = "2026-09-01T16:00:00+00:00"
START_DT = datetime(2026, 9, 1, 15, 0, tzinfo=UTC)
END_DT = datetime(2026, 9, 1, 16, 0, tzinfo=UTC)


def _dispose_engine() -> None:
    """Drop the shared async engine's pool so no asyncpg connection is reused
    across the per-test TestClient event loops (which would raise 'Event loop is
    closed' on cleanup). The tick opens extra engine connections via
    ``publish_event``, so this matters here."""
    import asyncio

    from wild_life.db.session import engine

    try:
        asyncio.run(engine.dispose())
    except Exception:
        pass


@pytest.fixture(autouse=True)
def fresh_engine() -> Generator[None, None, None]:
    _dispose_engine()
    yield
    _dispose_engine()


@pytest.fixture
def fake_mail() -> Generator[FakeTransport, None, None]:
    """Force-enable mail + inject a FakeTransport for the duration of a test."""
    fake = FakeTransport()
    prev = (
        settings.mail_enabled,
        settings.smtp_user,
        settings.smtp_password,
        settings.mail_from,
    )
    settings.mail_enabled = True
    settings.smtp_user = "paul@payne.io"
    settings.smtp_password = "bridge-pw"
    settings.mail_from = "paul@payne.io"
    app.dependency_overrides[get_transport] = lambda: fake
    try:
        yield fake
    finally:
        app.dependency_overrides.pop(get_transport, None)
        (
            settings.mail_enabled,
            settings.smtp_user,
            settings.smtp_password,
            settings.mail_from,
        ) = prev


def _event(client: TestClient, h: dict, **body: object) -> dict:
    body.setdefault("title", f"{MARK} evt")
    body.setdefault("start_at", START)
    r = client.post("/events", headers=h, json=body)
    assert r.status_code in (200, 201), r.text
    return r.json()


def _tick(client: TestClient, h: dict) -> dict:
    r = client.post("/calendar/mail/tick", headers=h)
    assert r.status_code == 200, r.text
    return r.json()


def test_disabled_tick_is_noop(
    client: TestClient, auth_headers: dict, require_db: None
) -> None:
    # No fake_mail fixture → mail_enabled stays False.
    prev = settings.mail_enabled
    settings.mail_enabled = False
    try:
        assert _tick(client, auth_headers)["disabled"] is True
    finally:
        settings.mail_enabled = prev


def test_hosted_invite_lifecycle(
    client: TestClient, auth_headers: dict, require_db: None, fake_mail: FakeTransport
) -> None:
    h = auth_headers
    made: list[str] = []
    try:
        ev = _event(client, h, attendees=["alice@x.com", "bob@y.com"], end_at=END)
        made.append(ev["id"])
        eid = ev["id"]

        # Explicit send → REQUEST to both guests.
        r = client.post(f"/events/{eid}/invites/send", headers=h)
        assert r.status_code == 200, r.text
        assert r.json()["requests_sent"] == 2
        assert sorted(fake_mail.sent_to_with_method("REQUEST")) == [
            "alice@x.com",
            "bob@y.com",
        ]

        # Idempotent: a tick with no change resends nothing.
        fake_mail.sent.clear()
        res = _tick(client, h)
        assert res["requests_sent"] == 0

        # Add a guest → only the new address is invited.
        client.patch(
            f"/events/{eid}",
            headers=h,
            json={"attendees": ["alice@x.com", "bob@y.com", "carol@z.com"]},
        )
        _tick(client, h)
        assert fake_mail.sent_to_with_method("REQUEST") == ["carol@z.com"]

        # Edit the time → everyone gets an update (sequence bump).
        fake_mail.sent.clear()
        client.patch(
            f"/events/{eid}", headers=h, json={"start_at": "2026-09-01T17:00:00+00:00"}
        )
        _tick(client, h)
        assert sorted(fake_mail.sent_to_with_method("REQUEST")) == [
            "alice@x.com",
            "bob@y.com",
            "carol@z.com",
        ]

        # Remove a guest → that guest gets a CANCEL, nobody else.
        fake_mail.sent.clear()
        client.patch(
            f"/events/{eid}",
            headers=h,
            json={"attendees": ["alice@x.com", "bob@y.com"]},
        )
        _tick(client, h)
        assert fake_mail.sent_to_with_method("CANCEL") == ["carol@z.com"]
        assert fake_mail.sent_to_with_method("REQUEST") == []
    finally:
        for i in made:
            client.delete(f"/events/{i}", headers=h)


def test_guests_endpoint_reflects_status(
    client: TestClient, auth_headers: dict, require_db: None, fake_mail: FakeTransport
) -> None:
    h = auth_headers
    made: list[str] = []
    try:
        ev = _event(client, h, attendees=["alice@x.com"], end_at=END)
        made.append(ev["id"])
        eid = ev["id"]

        # Before sending: pending.
        guests = client.get(f"/events/{eid}/guests", headers=h).json()
        assert guests == [
            {"email": "alice@x.com", "name": None, "invited": False, "partstat": None}
        ]

        client.post(f"/events/{eid}/invites/send", headers=h)
        guests = client.get(f"/events/{eid}/guests", headers=h).json()
        assert guests[0]["invited"] is True and guests[0]["partstat"] is None

        # An inbound REPLY from the guest → partstat shows up.
        ext = client.get(f"/events/{eid}", headers=h).json()["external_ref"]
        reply = ics.build_reply(
            uid=ext,
            sequence=0,
            organizer="mailto:paul@payne.io",
            attendee_addr="alice@x.com",
            partstat="ACCEPTED",
            summary="x",
            start=START_DT,
        )
        fake_mail._inbound.append(make_ics_email("alice@x.com", reply, "REPLY"))
        res = _tick(client, h)
        assert res["responses_ingested"] == 1
        guests = client.get(f"/events/{eid}/guests", headers=h).json()
        assert guests[0]["partstat"] == "accepted"
    finally:
        for i in made:
            client.delete(f"/events/{i}", headers=h)


def test_received_invite_reply_once(
    client: TestClient, auth_headers: dict, require_db: None, fake_mail: FakeTransport
) -> None:
    h = auth_headers
    made: list[str] = []
    try:
        # A received invite: organizer is someone else.
        ev = _event(
            client,
            h,
            organizer="mailto:host@corp.com",
            external_ref="incoming-1@corp.com",
            sequence=0,
            rsvp_status="accepted",
            end_at=END,
        )
        made.append(ev["id"])

        res = _tick(client, h)
        assert res["replies_sent"] == 1
        assert fake_mail.sent_to_with_method("REPLY") == ["host@corp.com"]

        # rsvp_sent_status now matches → no resend.
        fake_mail.sent.clear()
        assert _tick(client, h)["replies_sent"] == 0
        # A hosted event never sends a REPLY, a received one never a REQUEST.
        assert fake_mail.sent_methods() == []
    finally:
        for i in made:
            client.delete(f"/events/{i}", headers=h)


def test_rsvp_endpoint_sends_immediately(
    client: TestClient, auth_headers: dict, require_db: None, fake_mail: FakeTransport
) -> None:
    h = auth_headers
    made: list[str] = []
    try:
        # A received invite (foreign organizer).
        ev = _event(
            client,
            h,
            organizer="mailto:host@corp.com",
            external_ref="rsvp-now@corp.com",
            sequence=0,
            end_at=END,
        )
        made.append(ev["id"])
        eid = ev["id"]

        # Setting the RSVP emails the REPLY right away — no tick needed.
        r = client.post(f"/events/{eid}/rsvp", headers=h, json={"status": "accepted"})
        assert r.status_code == 200, r.text
        assert r.json()["rsvp_status"] == "accepted"
        assert r.json()["rsvp_sent_status"] == "accepted"
        assert fake_mail.sent_to_with_method("REPLY") == ["host@corp.com"]

        # A later tick doesn't resend (sent status already matches).
        fake_mail.sent.clear()
        assert _tick(client, h)["replies_sent"] == 0

        # A hosted event rejects the RSVP endpoint.
        hosted = _event(client, h, attendees=["a@x.com"])
        made.append(hosted["id"])
        assert (
            client.post(
                f"/events/{hosted['id']}/rsvp", headers=h, json={"status": "accepted"}
            ).status_code
            == 400
        )
    finally:
        for i in made:
            client.delete(f"/events/{i}", headers=h)


def test_inbound_request_and_cancel(
    client: TestClient, auth_headers: dict, require_db: None, fake_mail: FakeTransport
) -> None:
    h = auth_headers
    uid = f"{MARK}-inbound@corp.com"
    try:
        req = ics.build_request(
            uid=uid,
            sequence=0,
            organizer="mailto:host@corp.com",
            attendees=[("paul@payne.io", None)],
            summary=f"{MARK} incoming",
            start=START_DT,
            end=END_DT,
        )
        fake_mail._inbound.append(make_ics_email("host@corp.com", req, "REQUEST"))
        res = _tick(client, h)
        assert res["invites_ingested"] == 1

        got = client.get("/events", headers=h, params={"external_ref__eq": uid}).json()
        assert len(got) == 1 and got[0]["organizer"] == "mailto:host@corp.com"

        # A CANCEL for the same UID removes it.
        cancel = ics.build_cancel(
            uid=uid,
            sequence=1,
            organizer="mailto:host@corp.com",
            attendees=[("paul@payne.io", None)],
            summary="x",
            start=START_DT,
        )
        fake_mail._inbound.append(make_ics_email("host@corp.com", cancel, "CANCEL"))
        _tick(client, h)
        assert (
            client.get("/events", headers=h, params={"external_ref__eq": uid}).json()
            == []
        )
    finally:
        got = client.get("/events", headers=h, params={"external_ref__eq": uid}).json()
        for e in got:
            client.delete(f"/events/{e['id']}", headers=h)
