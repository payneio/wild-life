"""Bearer-token auth as a pure-ASGI middleware.

Implemented at the ASGI layer (not ``BaseHTTPMiddleware``) so it adds no extra
task/event-loop hop around the app — which keeps it clear of the async-SQLAlchemy
"attached to a different loop" pitfall. It runs before routing, so unauthenticated
requests get a clean 401 without touching the database. ``/health`` and the docs
stay open, and CORS preflight (``OPTIONS``) is never challenged.

Each accepted token resolves to an :class:`~wild_life.identity.Identity` via the
in-memory :data:`~wild_life.identity.registry`; the identity is attached to
``scope["state"]`` (readable as ``request.state.identity``). Workers additionally get
a coarse default-deny on writes here — fine-grained scoping lives in the routers.
"""

from starlette.responses import JSONResponse
from starlette.types import ASGIApp, Receive, Scope, Send

from wild_life.identity import TokenRegistry, worker_write_allowed

OPEN_PATHS = {"/health", "/docs", "/redoc", "/openapi.json"}


class BearerAuthMiddleware:
    """Resolve ``Authorization: Bearer <token>`` to an identity, or reject."""

    def __init__(self, app: ASGIApp, registry: TokenRegistry) -> None:
        self.app = app
        self.registry = registry

    async def __call__(self, scope: Scope, receive: Receive, send: Send) -> None:
        if scope["type"] != "http":
            await self.app(scope, receive, send)
            return
        if scope["method"] == "OPTIONS" or scope["path"] in OPEN_PATHS:
            await self.app(scope, receive, send)
            return

        headers = dict(scope["headers"])
        auth = headers.get(b"authorization", b"")
        identity = None
        if auth.startswith(b"Bearer "):
            identity = self.registry.lookup(auth[7:].decode("latin-1"))
        if identity is None:
            await self._deny(scope, receive, send, 401, "Invalid or missing token")
            return

        # Coarse default-deny: a worker may read anything but only write through
        # the allow-listed endpoints (routers enforce row/field scope on top).
        if identity.is_worker and scope["method"] not in ("GET", "HEAD"):
            if not worker_write_allowed(scope["method"], scope["path"]):
                await self._deny(scope, receive, send, 403, "Not permitted for worker")
                return

        scope["state"] = {**scope.get("state", {}), "identity": identity}
        await self.app(scope, receive, send)

    @staticmethod
    async def _deny(
        scope: Scope, receive: Receive, send: Send, code: int, detail: str
    ) -> None:
        headers = {"WWW-Authenticate": "Bearer"} if code == 401 else None
        response = JSONResponse({"detail": detail}, status_code=code, headers=headers)
        await response(scope, receive, send)
