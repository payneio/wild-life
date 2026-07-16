"""Bearer-token auth as a pure-ASGI middleware.

Implemented at the ASGI layer (not ``BaseHTTPMiddleware``) so it adds no extra
task/event-loop hop around the app — which keeps it clear of the async-SQLAlchemy
"attached to a different loop" pitfall. It runs before routing, so unauthenticated
requests get a clean 401 without touching the database. ``/health`` and the docs
stay open, and CORS preflight (``OPTIONS``) is never challenged.
"""

from starlette.responses import JSONResponse
from starlette.types import ASGIApp, Receive, Scope, Send

OPEN_PATHS = {"/health", "/docs", "/redoc", "/openapi.json"}


class BearerAuthMiddleware:
    """Reject any request lacking ``Authorization: Bearer <token>``."""

    def __init__(self, app: ASGIApp, token: str) -> None:
        self.app = app
        self._expected = f"Bearer {token}".encode()

    async def __call__(self, scope: Scope, receive: Receive, send: Send) -> None:
        if scope["type"] != "http":
            await self.app(scope, receive, send)
            return
        if scope["method"] == "OPTIONS" or scope["path"] in OPEN_PATHS:
            await self.app(scope, receive, send)
            return
        headers = dict(scope["headers"])
        if headers.get(b"authorization") != self._expected:
            response = JSONResponse(
                {"detail": "Invalid or missing token"},
                status_code=401,
                headers={"WWW-Authenticate": "Bearer"},
            )
            await response(scope, receive, send)
            return
        await self.app(scope, receive, send)
