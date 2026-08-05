"""The reminder tick's idempotency, for a projected series specifically.

The bug this pins: ``sent_reminders`` keyed on a FK into ``moments``, so the
tick could record a reminder for a stored occasion but not for a *projected*
recurring one — a rule's occurrences are computed, never materialised, so there
was no moment row for the FK to point at. The insert violated the FK, the tick's
commit rolled back, no ledger row was written, and every subsequent tick
re-sent. A recurring meeting therefore re-notified on every tick, all day.

The subject is a soft polymorphic edge now (``moment`` | ``routine``), so a
projection records against its routine and the second tick stays silent.
"""

from collections.abc import Generator
from datetime import UTC, datetime, timedelta

import pytest
from fastapi.testclient import TestClient
from sqlalchemy import create_engine, text

from wild_life import push
from wild_life.config import settings

MARK = "ZZ-reminder-test"


def _dispose_engine() -> None:
    """Drop the shared async engine's pool so no asyncpg connection is reused
    across the per-test TestClient event loops. The tick opens extra engine
    connections via ``publish_event``, so — like ``test_calendar_mail_tick`` —
    leaving them would raise 'Event loop is closed' in *later* tests."""
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
def captured_push(monkeypatch: pytest.MonkeyPatch) -> Generator[list, None, None]:
    """Force push on and capture every send instead of hitting the network."""
    sent: list[dict] = []

    def _fake_send(*, endpoint, p256dh, auth, payload):  # noqa: ANN001, ANN202
        sent.append(payload)

    monkeypatch.setattr(push, "is_enabled", lambda: True)
    monkeypatch.setattr(push, "send_push", _fake_send)
    yield sent


def _seed_subscription() -> None:
    eng = create_engine(settings.sync_database_url, future=True)
    try:
        with eng.begin() as conn:
            conn.execute(
                text(
                    "INSERT INTO wild_life.push_subscriptions "
                    "(id, endpoint, p256dh, auth, label, created_at, updated_at) "
                    "VALUES (gen_random_uuid(), :e, 'x', 'y', :l, now(), now()) "
                    "ON CONFLICT (endpoint) DO NOTHING"
                ),
                {"e": f"{MARK}-endpoint", "l": MARK},
            )
    finally:
        eng.dispose()


def _cleanup() -> None:
    eng = create_engine(settings.sync_database_url, future=True)
    try:
        with eng.begin() as conn:
            conn.execute(
                text("DELETE FROM wild_life.push_subscriptions WHERE label = :l"),
                {"l": MARK},
            )
            conn.execute(text("DELETE FROM wild_life.routines WHERE name LIKE 'ZZ-%'"))
            # Ledger rows key on the routine we just deleted; sweep by that.
            conn.execute(
                text(
                    "DELETE FROM wild_life.sent_reminders sr "
                    "WHERE sr.subject_type = 'routine' "
                    "AND NOT EXISTS (SELECT 1 FROM wild_life.routines r "
                    "WHERE r.id = sr.subject_id)"
                )
            )
    finally:
        eng.dispose()


def test_projected_series_notifies_once(
    require_db: None, client: TestClient, auth_headers: dict, captured_push: list
) -> None:
    """A recurring occasion inside the reminder window fires one push, and a
    second tick — the thing that used to re-send all day — stays silent."""
    # Land a 60-minute-out occurrence: a daily occasion whose slot is ~55 min
    # from now, inside the 60-minute lead but not the 1440 one.
    slot = (datetime.now(UTC) + timedelta(minutes=55)).strftime("%H:%M")
    try:
        _seed_subscription()
        r = client.post(
            "/routines",
            headers=auth_headers,
            json={
                "kind": "occasion",
                "name": f"{MARK} standup",
                "timing": [slot],
                "interval_days": 1,
                "status": "active",
            },
        )
        assert r.status_code in (200, 201), r.text

        # The box's live calendar may put other occasions in the window and has
        # several push subscriptions (one payload each), so assert about the
        # distinct slots pushed for *this* routine, across ticks.
        def mine(sent: list) -> set:
            return {p["start_at"] for p in sent if p.get("title") == f"{MARK} standup"}

        first = client.post("/calendar/reminders/tick", headers=auth_headers)
        assert first.status_code == 200, first.text
        assert len(mine(captured_push)) == 1, captured_push
        assert all(
            p["kind"] == "reminder"
            for p in captured_push
            if p.get("title") == f"{MARK} standup"
        )

        # The second tick must not re-send: the ledger recorded the routine slot.
        # Before the fix, the FK insert rolled back and this fired again.
        second = client.post("/calendar/reminders/tick", headers=auth_headers)
        assert second.status_code == 200, second.text
        assert len(mine(captured_push)) == 1, captured_push
    finally:
        _cleanup()
