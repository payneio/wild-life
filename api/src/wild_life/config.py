"""Configuration for wild-life-api."""

import uuid
from pathlib import Path

from pydantic_settings import BaseSettings

DB_SCHEMA = "wild_life"


class Settings(BaseSettings):
    """Service settings loaded from environment variables."""

    data_dir: Path = Path("./data")
    host: str = "0.0.0.0"
    port: int = 9005

    # Async DSN used by the running app (asyncpg driver).
    database_url: str = "postgresql+asyncpg://castle:castle@localhost:5432/castle"
    # Bearer token every request (except open paths) must present.
    # Field name is 'token' so the env var is WILD_LIFE_TOKEN (prefix + name).
    token: str = "dev-token"
    # The Person the owner token acts as (the "self" node). Env
    # WILD_LIFE_SELF_PERSON_ID; None = owner acts with no Person identity.
    self_person_id: uuid.UUID | None = None
    # Comma-separated list of allowed browser origins for CORS.
    cors_origins: str = "http://localhost:5173"

    # Web Push (VAPID). Private key is a PKCS8 PEM (env WILD_LIFE_VAPID_PRIVATE_KEY,
    # mapped from the castle secret VAPID_PRIVATE_KEY); the public application-server
    # key is derived from it at runtime. Empty = push disabled.
    vapid_private_key: str = ""
    vapid_subject: str = "mailto:paul@payne.io"
    # Reminder lead times in minutes before an event start (comma-separated).
    reminder_leads: str = "1440,60"

    # Calendar mail (iMIP invites over Proton Bridge). Off by default so dev/test
    # never send real email; production flips WILD_LIFE_MAIL_ENABLED=true. The
    # SMTP/IMAP endpoints default to the local Proton Bridge; the password maps
    # from the castle secret PROTONMAIL_API_KEY (the Bridge password) via
    # WILD_LIFE_SMTP_PASSWORD in the deployment env.
    mail_enabled: bool = False
    smtp_host: str = "127.0.0.1"
    smtp_port: int = 1025
    imap_host: str = "127.0.0.1"
    imap_port: int = 1143
    smtp_user: str = ""
    smtp_password: str = ""
    # The organizer / From identity used on outbound invites (mailto sans scheme).
    mail_from: str = "paul@payne.io"
    mail_mailbox: str = "INBOX"
    # IMAP keyword marking already-ingested messages. Distinct from the legacy
    # calendar-mail sidecar's "CalIngested" so the two can coexist during rollout.
    mail_keyword: str = "WLCalIngested"
    # How often the in-process poll loop runs the two-way sync (seconds). The
    # loop sleeps this long before its first pass, so tests never trigger it.
    mail_poll_seconds: int = 300

    model_config = {
        "env_prefix": "WILD_LIFE_",
        "env_file": ".env",
    }

    @property
    def cors_origin_list(self) -> list[str]:
        """CORS origins as a list."""
        return [o.strip() for o in self.cors_origins.split(",") if o.strip()]

    @property
    def self_address(self) -> str:
        """The owner's own email — used to tell hosted events (I invite others)
        from received invites (someone else is the organizer)."""
        return self.mail_from.strip().lower()

    @property
    def reminder_lead_minutes(self) -> list[int]:
        """Reminder lead times as a sorted (descending) list of minutes."""
        vals = {int(x) for x in self.reminder_leads.split(",") if x.strip()}
        return sorted(vals, reverse=True)

    @property
    def sync_database_url(self) -> str:
        """Synchronous DSN (psycopg) used by Alembic migrations."""
        return self.database_url.replace("+asyncpg", "+psycopg")

    def ensure_data_dir(self) -> None:
        """Create data directory if it doesn't exist."""
        self.data_dir.mkdir(parents=True, exist_ok=True)


settings = Settings()
