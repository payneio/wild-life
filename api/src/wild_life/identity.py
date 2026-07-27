"""Caller identity: credential → Person + role, and the worker write policy.

The bearer token a request presents is resolved to an :class:`Identity` by an
in-memory :class:`TokenRegistry` (loaded once at startup, refreshed when tokens are
minted/revoked). The auth middleware attaches the resolved identity to the ASGI
``scope["state"]`` so downstream handlers can read it via :func:`current_identity`.

Three roles:
- ``full``   — the owner credential; unrestricted (maps to the "self" Person).
- ``worker`` — a delegated assistant; may read everything but only write through a
  small allow-list of endpoints (enforced coarsely here, finely in the routers).
- ``ingest`` — a device posting observations. Never comes from the token registry:
  the middleware mints it only for an HTTP Basic credential on ``/ingest/*``, so it
  cannot appear on any other path. Reads nothing, owns nothing.
"""

import hashlib
import re
import uuid
from dataclasses import dataclass

from fastapi import HTTPException, Request, status
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from wild_life.models.auth import ApiToken


def hash_token(raw: str) -> str:
    """Stable hash used to store/look up a token (never store the raw value)."""
    return hashlib.sha256(raw.encode()).hexdigest()


@dataclass(frozen=True)
class Identity:
    """Who a request is acting as."""

    role: str  # "full" | "worker" | "ingest"
    person_id: uuid.UUID | None
    token_hash: str | None = None

    @property
    def is_worker(self) -> bool:
        return self.role == "worker"


# A device posting observations. Minted by the auth middleware for a valid Basic
# credential on /ingest/*, never stored and never in the token registry.
INGEST_IDENTITY = Identity("ingest", None)


class TokenRegistry:
    """In-memory map of token-hash → Identity, refreshable from the DB."""

    def __init__(self) -> None:
        self._by_hash: dict[str, Identity] = {}
        self._owner_hash: str | None = None
        self._owner: Identity | None = None

    def set_owner(self, token: str, person_id: uuid.UUID | None) -> None:
        """Register the owner (full-access) credential from settings."""
        self._owner_hash = hash_token(token)
        self._owner = Identity("full", person_id, self._owner_hash)
        self._by_hash[self._owner_hash] = self._owner

    async def reload(self, session: AsyncSession) -> None:
        """Rebuild the map from the owner credential + active DB tokens."""
        fresh: dict[str, Identity] = {}
        if self._owner_hash and self._owner is not None:
            fresh[self._owner_hash] = self._owner
        rows = await session.execute(
            select(ApiToken).where(ApiToken.revoked_at.is_(None))
        )
        for tok in rows.scalars():
            fresh[tok.token_hash] = Identity(tok.role, tok.person_id, tok.token_hash)
        self._by_hash = fresh

    def lookup(self, raw_token: str) -> Identity | None:
        return self._by_hash.get(hash_token(raw_token))


# Process-wide singleton; populated in the app lifespan (see main.py).
registry = TokenRegistry()


# --- worker coarse write policy -------------------------------------------
# A worker may GET anything; a non-GET is rejected unless (method, path) matches
# one of these. Fine-grained row/field scoping lives in the routers themselves.
_WORKER_WRITE_ALLOW: list[tuple[str | None, re.Pattern[str]]] = [
    ("POST", re.compile(r"^/tasks$")),
    ("PATCH", re.compile(r"^/tasks/[^/]+$")),
    ("POST", re.compile(r"^/tasks/[^/]+/claim$")),
    ("POST", re.compile(r"^/tasks/[^/]+/release$")),
    ("POST", re.compile(r"^/notes$")),
    ("POST", re.compile(r"^/requests$")),
    ("PATCH", re.compile(r"^/requests/[^/]+$")),
    ("POST", re.compile(r"^/requests/[^/]+/resolve$")),
    ("POST", re.compile(r"^/delegations$")),
    ("PATCH", re.compile(r"^/delegations/[^/]+$")),
    (None, re.compile(r"^/mcp-worker(/.*)?$")),  # the worker's own MCP endpoint
]


def worker_write_allowed(method: str, path: str) -> bool:
    """Coarse default-deny check for worker mutations (method + path only)."""
    for allowed_method, pattern in _WORKER_WRITE_ALLOW:
        if (allowed_method is None or allowed_method == method) and pattern.match(path):
            return True
    return False


def current_identity(request: Request) -> Identity:
    """FastAPI dependency: the identity the auth middleware resolved."""
    identity = getattr(request.state, "identity", None)
    if (
        identity is None
    ):  # pragma: no cover - middleware always sets it on protected paths
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, detail="No identity")
    return identity


def require_owner(request: Request) -> Identity:
    """Dependency for owner-only routes (e.g. token administration)."""
    identity = current_identity(request)
    if identity.role != "full":
        raise HTTPException(status.HTTP_403_FORBIDDEN, detail="Owner only")
    return identity
