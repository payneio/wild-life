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

    # Device ingest (/ingest/*). A credential of its own rather than the owner
    # token: a phone is lost more easily than a laptop, and this one can do nothing
    # but post observations. Trackers like OwnTracks can only send HTTP Basic, so
    # it travels as the password. Empty (the default) disables ingest entirely.
    ingest_token: str = ""
    ingest_user: str = "phone"

    # Geofencing. A fix worse than this asserts nothing and is stored without being
    # evaluated; cell-tower-only fixes routinely run to several hundred metres.
    geofence_max_accuracy_m: float = 200
    # How far outside a fence a fix may sit and still be credited to it: at most
    # this many standard deviations of its own error, and never more than the
    # absolute cap. Both apply — see geo.fit_score for why one without the other
    # fails. 2σ ≈ 95% of the error distribution.
    snap_max_slack_sigma: float = 2.0
    snap_max_slack_m: float = 100
    # No consumer GPS is honestly good to a metre; this keeps an optimistic
    # accuracy report from making the fit curve absurdly sharp.
    snap_sigma_floor_m: float = 10
    # How much better a rival place must score to suppress another. Only applies
    # between fences that genuinely compete — one that encloses the other is
    # nesting, not rivalry, and never suppresses it.
    snap_margin: float = 2.0
    # Leaving requires holding "not here" for this many fixes — unless the fix is
    # past the hard factor, which is unambiguous enough to act on at once. Without
    # this, sitting near a boundary produces dozens of visits in an afternoon.
    geofence_hard_exit_factor: float = 3.0
    geofence_exit_consecutive: int = 2
    # A visit shorter than this was a passing-through, not a being-somewhere. It
    # is dropped when it closes; with a single fix there is nothing to tell a
    # five-minute stop from a drive past, so we do not pretend otherwise.
    min_visit_seconds: int = 120
    # A visit with no confirming fix for this long is closed as `stale` rather than
    # left open forever by a phone that died.
    visit_stale_seconds: int = 6 * 60 * 60
    # How long the in-process fence list may be reused. Moving a fence takes effect
    # within this window; history is corrected by re-derivation regardless.
    fence_cache_seconds: float = 60.0
    # Fixes older than this behind the newest known one are backfill: stored, but
    # left to the tick's replay rather than run through the live state machine.
    backfill_grace_seconds: float = 120.0
    # How far back each tick re-derives. Covers an offline phone flushing its queue.
    visit_replay_hours: int = 48

    # Stop detection. Candidates are clustered from *stops*, not from readings:
    # cluster raw readings and every traffic light becomes a place.
    stop_radius_m: float = 80
    stop_min_dwell_seconds: int = 900
    # A gap longer than this ends a stop even if the position barely moved.
    #
    # Must match `visit_stale_seconds`, because the two answer the same question:
    # how long a silence may we assume presence across? This was an hour while
    # that was six, which quietly assumed a tracker reporting every few minutes.
    # A real one reports every few *hours* — Android suspends it, the phone
    # sleeps — so every run was broken before it could reach the dwell minimum
    # and nothing was ever proposed. Sitting at home all night has to read as one
    # stop, not as nine silences.
    stop_max_gap_seconds: int = 6 * 60 * 60
    # How much history the nightly recompute considers.
    candidate_window_days: int = 90
    # Below this a candidate exists but stays out of the review queue, so a place
    # you passed once does not demand a decision.
    candidate_min_stops: int = 3
    candidate_min_seconds: int = 4 * 60 * 60

    # Reverse geocoding, used only when you promote a candidate — never in the
    # ingest path and never as a background enrichment pass. This is the one
    # place a coordinate leaves the box; set false to keep even that local.
    geocode_enabled: bool = True
    geocode_url: str = "https://nominatim.openstreetmap.org/reverse"
    # The OSM usage policy *requires* an identifying User-Agent with contact
    # details. A generic one gets the IP blocked.
    geocode_user_agent: str = "wild-life/0.1 (paul@payne.io)"
    geocode_timeout_seconds: float = 5.0

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
