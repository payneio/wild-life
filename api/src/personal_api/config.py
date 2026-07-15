"""Configuration for personal-api."""

from pathlib import Path

from pydantic_settings import BaseSettings

DB_SCHEMA = "personal_api"


class Settings(BaseSettings):
    """Service settings loaded from environment variables."""

    data_dir: Path = Path("./data")
    host: str = "0.0.0.0"
    port: int = 9005

    # Async DSN used by the running app (asyncpg driver).
    database_url: str = "postgresql+asyncpg://castle:castle@localhost:5432/castle"
    # Bearer token every request (except open paths) must present.
    # Field name is 'token' so the env var is PERSONAL_API_TOKEN (prefix + name).
    token: str = "dev-token"
    # Comma-separated list of allowed browser origins for CORS.
    cors_origins: str = "http://localhost:5173"

    model_config = {
        "env_prefix": "PERSONAL_API_",
        "env_file": ".env",
    }

    @property
    def cors_origin_list(self) -> list[str]:
        """CORS origins as a list."""
        return [o.strip() for o in self.cors_origins.split(",") if o.strip()]

    @property
    def sync_database_url(self) -> str:
        """Synchronous DSN (psycopg) used by Alembic migrations."""
        return self.database_url.replace("+asyncpg", "+psycopg")

    def ensure_data_dir(self) -> None:
        """Create data directory if it doesn't exist."""
        self.data_dir.mkdir(parents=True, exist_ok=True)


settings = Settings()
