"""Test fixtures for personal-api."""

from collections.abc import Generator
from pathlib import Path

import pytest
from fastapi.testclient import TestClient
from sqlalchemy import create_engine, text

from personal_api.config import settings
from personal_api.main import app


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
