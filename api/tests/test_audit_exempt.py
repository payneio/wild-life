"""`__audit__ = False` keeps observation data out of change_log — and off the SSE stream.

Every insert normally becomes a change_log row with a full column snapshot, which a
Postgres trigger then pg_notifies to every open SSE stream. At device ping rate that
would cost more storage than the pings themselves and would flood every browser, so
`LocationPing` opts out. This is the regression test for that.

Needs the castle Postgres. Everything happens inside a transaction that is rolled
back, so nothing is left behind.
"""

from datetime import UTC, datetime

from sqlalchemy import create_engine, func, select
from sqlalchemy.orm import Session

import wild_life.db.session  # noqa: F401  — importing registers the audit listener
from wild_life.config import settings
from wild_life.models.history import ChangeLog
from wild_life.models.locations import Location, LocationPing

MARK = "ZZ-audit-test"


def _ping(**overrides: object) -> LocationPing:
    values: dict = {
        "device_id": MARK,
        "recorded_at": datetime(2026, 7, 27, 12, 0, tzinfo=UTC),
        "latitude": 47.6205,
        "longitude": -122.3493,
    }
    return LocationPing(**(values | overrides))


def test_ping_writes_no_change_log(require_db: None) -> None:
    """The exempt table produces nothing to audit and nothing to broadcast."""
    engine = create_engine(settings.sync_database_url)
    try:
        with Session(engine) as session:
            before = session.scalar(select(func.count()).select_from(ChangeLog))
            session.add(_ping())
            session.flush()
            after = session.scalar(select(func.count()).select_from(ChangeLog))
            assert after == before
            session.rollback()
    finally:
        engine.dispose()


def test_ping_keeps_its_bigint_key(require_db: None) -> None:
    """The exemption must be checked *before* audit.py stamps a uuid4 into `id`.

    That assignment exists so an audit row can reference a not-yet-inserted entity.
    An exempt model is free to use a non-UUID primary key, so if the guard were
    ordered after it, this insert would try to put a UUID in a BIGINT column.
    """
    engine = create_engine(settings.sync_database_url)
    try:
        with Session(engine) as session:
            ping = _ping()
            session.add(ping)
            session.flush()
            assert isinstance(ping.id, int)
            session.rollback()
    finally:
        engine.dispose()


def test_location_is_still_audited(require_db: None) -> None:
    """The control: a normal entity on the same table family still logs."""
    engine = create_engine(settings.sync_database_url)
    try:
        with Session(engine) as session:
            before = session.scalar(select(func.count()).select_from(ChangeLog))
            session.add(Location(name=f"{MARK} audited"))
            session.flush()
            after = session.scalar(select(func.count()).select_from(ChangeLog))
            assert after == before + 1
            session.rollback()
    finally:
        engine.dispose()
