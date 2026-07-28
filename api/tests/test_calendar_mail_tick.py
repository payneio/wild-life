"""Integration tests for the calendar-mail tick (needs the castle Postgres).

Bridge is replaced by a FakeTransport via dependency override, and mail is force
-enabled on the settings object, so nothing touches a real Proton Bridge.

iMIP runs on **moments and their calendar records** now. The meeting is a moment;
what other people have been told about it — UID, ORGANIZER, SEQUENCE, the guest
list, the RSVP pair — is its projection. The tests read differently in one
important way: sharing is an *act*. A moment starts private with no record at
all, and giving it a guest list is what makes anything sendable.
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


def _moment(client: TestClient, h: dict, **body: object) -> dict:
    """A private occasion: a moment, and nothing shared about it."""
    body.setdefault("kind", "occasion")
    body.setdefault("title", f"{MARK} evt")
    body.setdefault("started_at", START)
    r = client.post("/moments", headers=h, json=body)
    assert r.status_code in (200, 201), r.text
    return r.json()


def _share(client: TestClient, h: dict, mid: str, **record: object) -> dict:
    """Give it a projection — the act that makes it shareable at all."""
    r = client.patch(f"/moments/{mid}/calendar", headers=h, json=record)
    assert r.status_code == 200, r.text
    return r.json()


def _event(client: TestClient, h: dict, **body: object) -> dict:
    """A moment plus whatever of it is shared, as one call, for brevity here."""
    record = {
        k: body.pop(k)
        for k in ("attendees", "organizer", "external_ref", "sequence", "location")
        if k in body
    }
    rsvp = body.pop("rsvp_status", None)
    if "end_at" in body:
        body["ended_at"] = body.pop("end_at")
    made = _moment(client, h, **body)
    if record or rsvp is not None:
        _share(client, h, made["id"], **record)
        if rsvp is not None:
            # Set directly: the endpoint that would send a REPLY is what several
            # of these tests are about, so seeding must not itself send one.
            client.patch(f"/moments/{made['id']}/calendar", headers=h, json={})
            _seed_rsvp(client, h, made["id"], rsvp)
    return made


def _seed_rsvp(client: TestClient, h: dict, mid: str, value: str) -> None:
    from sqlalchemy import create_engine, text

    engine = create_engine(settings.sync_database_url, future=True)
    try:
        with engine.begin() as conn:
            conn.execute(
                text(
                    "UPDATE wild_life.calendar_records SET rsvp_status = :v "
                    "WHERE moment_id = :m"
                ),
                {"v": value, "m": mid},
            )
    finally:
        engine.dispose()


def _record(client: TestClient, h: dict, mid: str) -> dict:
    return client.get(f"/moments/{mid}/calendar", headers=h).json()


def _by_ref(client: TestClient, h: dict, uid: str) -> list[dict]:
    """Projections carrying this wire UID — how an ingested invitation is found."""
    from sqlalchemy import create_engine, text

    engine = create_engine(settings.sync_database_url, future=True)
    try:
        with engine.connect() as conn:
            return [
                {"moment_id": str(r.moment_id), "organizer": r.organizer}
                for r in conn.execute(
                    text(
                        "SELECT moment_id, organizer FROM wild_life.calendar_records "
                        "WHERE external_ref = :uid"
                    ),
                    {"uid": uid},
                )
            ]
    finally:
        engine.dispose()


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
        r = client.post(f"/moments/{eid}/invites/send", headers=h)
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
        _share(client, h, eid, attendees=["alice@x.com", "bob@y.com", "carol@z.com"])
        _tick(client, h)
        assert fake_mail.sent_to_with_method("REQUEST") == ["carol@z.com"]

        # Edit the time → everyone gets an update (sequence bump).
        fake_mail.sent.clear()
        # The meeting itself changed, so this edits the *moment*.
        client.patch(
            f"/moments/{eid}",
            headers=h,
            json={"started_at": "2026-09-01T17:00:00+00:00"},
        )
        _tick(client, h)
        assert sorted(fake_mail.sent_to_with_method("REQUEST")) == [
            "alice@x.com",
            "bob@y.com",
            "carol@z.com",
        ]

        # Remove a guest → that guest gets a CANCEL, nobody else.
        fake_mail.sent.clear()
        _share(client, h, eid, attendees=["alice@x.com", "bob@y.com"])
        _tick(client, h)
        assert fake_mail.sent_to_with_method("CANCEL") == ["carol@z.com"]
        assert fake_mail.sent_to_with_method("REQUEST") == []
    finally:
        for i in made:
            client.delete(f"/moments/{i}", headers=h)


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
        guests = client.get(f"/moments/{eid}/guests", headers=h).json()
        assert guests == [
            {"email": "alice@x.com", "name": None, "invited": False, "partstat": None}
        ]

        client.post(f"/moments/{eid}/invites/send", headers=h)
        guests = client.get(f"/moments/{eid}/guests", headers=h).json()
        assert guests[0]["invited"] is True and guests[0]["partstat"] is None

        # An inbound REPLY from the guest → partstat shows up.
        ext = _record(client, h, eid)["external_ref"]
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
        guests = client.get(f"/moments/{eid}/guests", headers=h).json()
        assert guests[0]["partstat"] == "accepted"
    finally:
        for i in made:
            client.delete(f"/moments/{i}", headers=h)


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
            client.delete(f"/moments/{i}", headers=h)


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
        r = client.post(f"/moments/{eid}/rsvp", headers=h, json={"status": "accepted"})
        assert r.status_code == 200, r.text
        shared = _record(client, h, eid)
        assert shared["rsvp_status"] == "accepted"
        assert shared["rsvp_sent_status"] == "accepted"
        assert fake_mail.sent_to_with_method("REPLY") == ["host@corp.com"]

        # A later tick doesn't resend (sent status already matches).
        fake_mail.sent.clear()
        assert _tick(client, h)["replies_sent"] == 0

        # A hosted event rejects the RSVP endpoint.
        hosted = _event(client, h, attendees=["a@x.com"])
        made.append(hosted["id"])
        assert (
            client.post(
                f"/moments/{hosted['id']}/rsvp", headers=h, json={"status": "accepted"}
            ).status_code
            == 400
        )
    finally:
        for i in made:
            client.delete(f"/moments/{i}", headers=h)


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

        got = _by_ref(client, h, uid)
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
        assert _by_ref(client, h, uid) == []
    finally:
        for e in _by_ref(client, h, uid):
            client.delete(f"/moments/{e['moment_id']}", headers=h)


def test_inbound_html_description_is_stored_as_plain_text(
    client: TestClient, auth_headers: dict, require_db: None, fake_mail: FakeTransport
) -> None:
    """HTML from the sender must not reach the column the UI edits."""
    h = auth_headers
    uid = f"{MARK}-html-desc@corp.com"
    try:
        req = ics.build_request(
            uid=uid,
            sequence=0,
            organizer="mailto:host@corp.com",
            attendees=[("paul@payne.io", None)],
            summary=f"{MARK} html body",
            start=START_DT,
            end=END_DT,
            description=(
                "Join with Google Meet: "
                '<a href="https://meet.google.com/abc-defg-hij">abc-defg-hij</a>'
                "<br>Learn more&nbsp;about Meet"
            ),
        )
        fake_mail._inbound.append(make_ics_email("host@corp.com", req, "REQUEST"))
        assert _tick(client, h)["invites_ingested"] == 1

        got = _by_ref(client, h, uid)
        moment = client.get(f"/moments/{got[0]['moment_id']}", headers=h).json()
        desc = moment["body"]
        for markup in ("<a ", "<br>", "&nbsp;"):
            assert markup not in desc
        assert "https://meet.google.com/abc-defg-hij" in desc

        # RSVPing back to the organizer is unaffected: a REPLY carries no
        # DESCRIPTION at all, and nothing re-sends the invite.
        fake_mail.sent.clear()
        assert (
            client.post(
                f"/moments/{got[0]['moment_id']}/rsvp",
                headers=h,
                json={"status": "accepted"},
            ).status_code
            == 200
        )
        assert fake_mail.sent_methods() == ["REPLY"]
        reply = "".join(
            str(part.get_content())
            for part in fake_mail.sent[0].walk()
            if part.get_content_type() == "text/calendar"
        )
        assert "DESCRIPTION" not in reply
        assert "meet.google.com" not in reply
        assert _tick(client, h)["requests_sent"] == 0
    finally:
        for e in _by_ref(client, h, uid):
            client.delete(f"/moments/{e['moment_id']}", headers=h)
