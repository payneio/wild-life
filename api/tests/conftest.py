"""Test fixtures for wild-life-api."""

from collections.abc import Generator
from pathlib import Path

import pytest
from fastapi.testclient import TestClient
from sqlalchemy import create_engine, text

from wild_life.config import settings
from wild_life.main import app


@pytest.fixture
def require_db() -> None:
    """Skip the test unless the castle Postgres is reachable."""
    try:
        eng = create_engine(settings.sync_database_url)
        with eng.connect() as conn:
            conn.execute(text("select 1"))
        eng.dispose()
    except Exception:
        pytest.skip("castle Postgres not available")


# Every table these tests write to, with the column carrying the MARK prefix.
# Children first: a leaked area can only be removed once nothing points at it.
_MARKED = (
    ("metric_entries", None),  # cascades from metrics; listed so the sweep reports it
    ("outcomes", "statement"),
    ("metrics", "name"),
    ("tasks", "title"),
    ("projects", "name"),
    ("protocols", "name"),
    ("programs", "name"),
    ("areas", "name"),
)


@pytest.fixture(scope="session", autouse=True)
def sweep_test_rows() -> Generator[None, None, None]:
    """Remove anything prefixed `ZZ-` once the run is over.

    These tests write to the real castle database on purpose — that is what
    `require_db` is for — so per-test teardown is the only thing standing between
    a run and someone's actual data. It isn't enough: one `finally` that forgot
    its areas left forty of them in the live app, visible in the sidebar.

    So the prefix convention gets teeth. A test that forgets to clean up is now a
    tidiness bug rather than a leak into a life-management app someone uses.
    """
    yield
    try:
        eng = create_engine(settings.sync_database_url)
    except Exception:  # pragma: no cover - no database, nothing to sweep
        return
    with eng.begin() as conn:
        # Moments first: a derived moment names its source row, so it has to go
        # before the row does or the ref stops resolving. The surfaces now write
        # moments inline, which means a test that creates a task also creates
        # moments — and the sweep that did not know about them was leaving those
        # in the live app's timeline.
        conn.execute(text("DELETE FROM wild_life.moments WHERE title LIKE 'ZZ-%'"))
        for table, column in _MARKED:
            if column is None:
                continue
            conn.execute(
                text(f"DELETE FROM wild_life.{table} WHERE {column} LIKE 'ZZ-%'")
            )
        # Anything derived whose source row is gone. The app itself never leaves
        # one — deleting a row takes its moments with it — but a test that
        # reaches past the API, or a database cascade, can.
        for prefix, table in (
            ("task", "tasks"),
            ("routine_instance", "routine_instances"),
            ("metric_entry", "metric_entries"),
            ("group_reading", "group_readings"),
            ("location_visit", "location_visits"),
        ):
            conn.execute(
                text(f"""
                    DELETE FROM wild_life.moments m
                     WHERE m.source_ref LIKE '{prefix}:%'
                       AND NOT EXISTS (
                           SELECT 1 FROM wild_life.{table} r
                            WHERE m.source_ref LIKE '{prefix}:' || r.id::text || '%'
                       )
                """)  # noqa: S608
            )
    eng.dispose()


@pytest.fixture
def temp_data_dir(tmp_path: Path) -> Generator[Path, None, None]:
    """Create a temporary data directory for tests."""
    data_dir = tmp_path / "data"
    data_dir.mkdir()
    original = settings.data_dir
    settings.data_dir = data_dir
    yield data_dir
    settings.data_dir = original


@pytest.fixture
def client(temp_data_dir: Path) -> Generator[TestClient, None, None]:
    """Create a test client with isolated data directory."""
    with TestClient(app) as client:
        yield client


@pytest.fixture
def auth_headers() -> dict[str, str]:
    """Authorization header carrying the configured bearer token."""
    return {"Authorization": f"Bearer {settings.token}"}
