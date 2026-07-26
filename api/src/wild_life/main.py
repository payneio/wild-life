"""Main application for wild-life-api."""

import asyncio
import logging
from collections.abc import AsyncGenerator
from contextlib import asynccontextmanager

import uvicorn
from fastapi import FastAPI, Request
from fastapi.encoders import jsonable_encoder
from fastapi.exceptions import RequestValidationError
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
import httpx
from fastmcp import FastMCP
from fastmcp.server.dependencies import get_http_headers
from fastmcp.server.providers.openapi import MCPType, RouteMap
from fastmcp.utilities.lifespan import combine_lifespans

from wild_life.auth import BearerAuthMiddleware
from wild_life.config import settings
from wild_life.db.session import AsyncSessionLocal
from wild_life.identity import registry
from wild_life.mail import scheduler as mail_scheduler
from wild_life.routers import (
    me,
    admin,
    calendar,
    calendar_mail,
    core,
    goals,
    history,
    knowledge,
    locations,
    merge,
    metrics,
    notes,
    nudges,
    organizations,
    people,
    preferences,
    push,
    reminders,
    requests,
    reviews,
    routines,
    search,
    stream,
    tags,
    tasks,
    tracking,
)
from wild_life.routers import health as health_routes


@asynccontextmanager
async def lifespan(app: FastAPI) -> AsyncGenerator[None, None]:
    """Application lifespan handler."""
    settings.ensure_data_dir()
    # Owner credential is in-memory (no DB); worker tokens load from the DB
    # best-effort so a transient DB hiccup at startup never locks out the owner.
    registry.set_owner(settings.token, settings.self_person_id)
    try:
        async with AsyncSessionLocal() as session:
            await registry.reload(session)
    except Exception:
        pass
    # Calendar-mail runs in-process: a background loop drives the two-way iMIP
    # sync on an interval (no external job). It self-gates on mail.is_enabled().
    mail_task = (
        asyncio.create_task(mail_scheduler.poll_loop())
        if settings.mail_poll_seconds > 0
        else None
    )
    try:
        yield
    finally:
        if mail_task is not None:
            mail_task.cancel()
            try:
                await mail_task
            except asyncio.CancelledError:
                pass


app = FastAPI(
    title="Wild Life API",
    description="Wild Life — single-user CRM/Calendar/Journal/Planner backend",
    version="0.1.0",
    lifespan=lifespan,
)

# Auth added first so it sits *inside* CORS: CORS handles preflight, then the
# bearer check runs on real requests. (Last-added middleware is outermost.)
app.add_middleware(BearerAuthMiddleware, registry=registry)
app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.cors_origin_list,
    allow_methods=["*"],
    allow_headers=["*"],
)


# Use uvicorn's error logger — it already has a handler wired to stderr (journald),
# so our warnings/exceptions actually surface (a bare "wild_life" logger would fall
# through to the unconfigured root and be dropped).
logger = logging.getLogger("uvicorn.error")


@app.exception_handler(RequestValidationError)
async def _log_validation_error(
    request: Request, exc: RequestValidationError
) -> JSONResponse:
    """422s are otherwise invisible in the logs — log the offending fields + body."""
    logger.warning(
        "422 %s %s — errors=%s body=%r",
        request.method,
        request.url.path,
        exc.errors(),
        getattr(exc, "body", None),
    )
    return JSONResponse(
        status_code=422, content={"detail": jsonable_encoder(exc.errors())}
    )


@app.exception_handler(Exception)
async def _log_unhandled(request: Request, exc: Exception) -> JSONResponse:
    """Log any unhandled error with a full traceback (returns a 500)."""
    logger.exception("500 %s %s — %s", request.method, request.url.path, exc)
    return JSONResponse(status_code=500, content={"detail": "Internal server error"})


@app.get("/health")
async def health() -> dict[str, str]:
    """Health check endpoint (unauthenticated — used by castle readiness)."""
    return {"status": "ok"}


app.include_router(admin.router)
app.include_router(me.router)
app.include_router(core.router)
app.include_router(tasks.router)
app.include_router(people.router)
app.include_router(organizations.router)
app.include_router(locations.router)
app.include_router(merge.router)
app.include_router(search.router)
app.include_router(routines.router)
app.include_router(goals.router)
app.include_router(metrics.router)
app.include_router(calendar.router)
app.include_router(calendar.people_links_router)
app.include_router(calendar_mail.router)
app.include_router(calendar_mail.event_invites_router)
app.include_router(preferences.router)
app.include_router(notes.router)
app.include_router(notes.images_router)
app.include_router(tracking.router)
app.include_router(requests.router)
app.include_router(reviews.router)
app.include_router(knowledge.router)
app.include_router(tags.router)
app.include_router(health_routes.router)
app.include_router(history.router)
app.include_router(stream.router)
app.include_router(push.router)
app.include_router(reminders.router)
app.include_router(nudges.router)


# --- MCP server -----------------------------------------------------------
# Auto-generate an MCP server from the assembled FastAPI app and mount it at
# /mcp (Streamable HTTP). Every data endpoint becomes a tool; the plumbing
# below (SSE, uploads, web-push, health, cron ticks) is excluded because it
# doesn't map cleanly onto tool calls. Anything not matched falls through to
# the default (-> Tool).
_MCP_EXCLUDE = [
    RouteMap(pattern=r"^/stream$", mcp_type=MCPType.EXCLUDE),
    RouteMap(pattern=r"^/health$", mcp_type=MCPType.EXCLUDE),
    RouteMap(pattern=r"^/push.*", mcp_type=MCPType.EXCLUDE),
    RouteMap(pattern=r".*/images.*", mcp_type=MCPType.EXCLUDE),
    RouteMap(pattern=r"^/note-images.*", mcp_type=MCPType.EXCLUDE),
    RouteMap(pattern=r".*/photo$", mcp_type=MCPType.EXCLUDE),
    RouteMap(pattern=r"^/calendar/reminders/tick$", mcp_type=MCPType.EXCLUDE),
    RouteMap(pattern=r"^/calendar/mail/tick$", mcp_type=MCPType.EXCLUDE),
    RouteMap(pattern=r"^/nudges/digest$", mcp_type=MCPType.EXCLUDE),
]

# from_fastapi calls the app in-process (httpx + ASGITransport), so its calls
# also pass through BearerAuthMiddleware — hand it the token so tools succeed.
# The /mcp endpoint itself is NOT in OPEN_PATHS, so BearerAuthMiddleware also
# protects it: MCP clients must present the same WILD_LIFE_TOKEN.
mcp = FastMCP.from_fastapi(
    app=app,
    name="wild-life",
    route_maps=_MCP_EXCLUDE,
    httpx_client_kwargs={"headers": {"Authorization": f"Bearer {settings.token}"}},
)
mcp_app = mcp.http_app(path="/")


# --- Scoped worker MCP ----------------------------------------------------
# A second, leaner MCP surface for delegated assistants at /mcp-worker: read
# tools plus only the writes a worker may perform (tasks/notes/requests/
# delegations). Auth + row/field scope are enforced by the API itself —
# FastMCP forwards the caller's bearer token to the internal call, so the
# worker's identity and its limits apply. No owner token is baked in here (a
# missing forward fails closed with 401 rather than escalating privilege).
_TOOL = MCPType.TOOL
_EXCL = MCPType.EXCLUDE
_WORKER_ROUTES = [
    RouteMap(methods=["POST"], pattern=r"^/tasks$", mcp_type=_TOOL),
    RouteMap(methods=["PATCH"], pattern=r"^/tasks/[^/]+$", mcp_type=_TOOL),
    RouteMap(methods=["POST"], pattern=r"^/tasks/[^/]+/claim$", mcp_type=_TOOL),
    RouteMap(methods=["POST"], pattern=r"^/tasks/[^/]+/release$", mcp_type=_TOOL),
    RouteMap(methods=["POST"], pattern=r"^/notes$", mcp_type=_TOOL),
    RouteMap(methods=["POST"], pattern=r"^/requests$", mcp_type=_TOOL),
    RouteMap(methods=["PATCH"], pattern=r"^/requests/[^/]+$", mcp_type=_TOOL),
    RouteMap(methods=["POST"], pattern=r"^/requests/[^/]+/resolve$", mcp_type=_TOOL),
    RouteMap(methods=["POST"], pattern=r"^/delegations$", mcp_type=_TOOL),
    RouteMap(methods=["PATCH"], pattern=r"^/delegations/[^/]+$", mcp_type=_TOOL),
    # infra / admin never exposed to workers
    RouteMap(pattern=r"^/stream$", mcp_type=_EXCL),
    RouteMap(pattern=r"^/health$", mcp_type=_EXCL),
    RouteMap(pattern=r"^/admin.*", mcp_type=_EXCL),
    RouteMap(pattern=r"^/push.*", mcp_type=_EXCL),
    RouteMap(pattern=r".*/images.*", mcp_type=_EXCL),
    RouteMap(pattern=r"^/note-images.*", mcp_type=_EXCL),
    RouteMap(pattern=r".*/photo$", mcp_type=_EXCL),
    # any other mutation is not permitted for workers
    RouteMap(methods=["POST", "PUT", "PATCH", "DELETE"], pattern=r".*", mcp_type=_EXCL),
    # everything else (reads) -> tool
    RouteMap(methods=["GET"], pattern=r".*", mcp_type=_TOOL),
]


async def _forward_auth(request: httpx.Request) -> None:
    """Forward the caller's bearer token to the internal API call.

    FastMCP strips ``authorization`` from forwarded headers by default; we
    re-add it (via the ``include`` override) so the worker's identity — and its
    scope limits — apply to the internal request. Nothing is baked in, so a
    missing token fails closed rather than escalating to owner access.
    """
    auth = get_http_headers(include={"authorization"}).get("authorization")
    if auth:
        request.headers["authorization"] = auth


worker_mcp = FastMCP.from_fastapi(
    app=app,
    name="wild-life-worker",
    route_maps=_WORKER_ROUTES,
    httpx_client_kwargs={"event_hooks": {"request": [_forward_auth]}},
)
worker_mcp_app = worker_mcp.http_app(path="/")

# from_fastapi needs the fully-built app, but each MCP session manager needs its
# own lifespan to run — so combine all three and reassign after construction.
app.router.lifespan_context = combine_lifespans(
    lifespan, mcp_app.lifespan, worker_mcp_app.lifespan
)
app.mount("/mcp", mcp_app)
app.mount("/mcp-worker", worker_mcp_app)


def run() -> None:
    """Run the application with uvicorn."""
    uvicorn.run(
        "wild_life.main:app",
        host=settings.host,
        port=settings.port,
        reload=False,
    )


if __name__ == "__main__":
    run()
