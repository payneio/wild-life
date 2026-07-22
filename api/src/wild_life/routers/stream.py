"""Server-Sent Events — the app's single live event bus.

Transport is Postgres ``LISTEN/NOTIFY`` on one channel (``wild_life_events``).
Publishers:
  * DB changes — a trigger on ``change_log`` (see the migration) ``pg_notify``s a
    ``{"kind":"change", ...}`` envelope on every insert/update/delete.
  * App events — anything can call :func:`publish_event` to push a ``{"kind": ...}``
    envelope onto the same channel (jobs, reminders, notifications, ...).

Each SSE connection opens its own ``asyncpg`` listener and forwards envelopes
verbatim; there is no in-process broadcaster (single-user → a handful of tabs).
"""

import asyncio
import json
import logging
from collections.abc import AsyncGenerator
from typing import Any

import asyncpg
from fastapi import APIRouter, Request
from sqlalchemy import text
from sse_starlette.sse import EventSourceResponse

from wild_life.config import settings
from wild_life.db.session import engine

log = logging.getLogger("wild_life.stream")

CHANNEL = "wild_life_events"
_MAX_STREAMS = 32
_active_streams = 0


def _raw_dsn() -> str:
    """asyncpg wants a plain libpq DSN, not the SQLAlchemy ``+asyncpg`` URL."""
    return settings.database_url.replace("+asyncpg", "")


async def publish_event(kind: str, data: dict[str, Any] | None = None) -> None:
    """Push an app-level event onto the shared live stream (non-DB events)."""
    payload = json.dumps({"kind": kind, **(data or {})})
    async with engine.connect() as conn:
        await conn.execute(
            text("SELECT pg_notify(:chan, :payload)"),
            {"chan": CHANNEL, "payload": payload},
        )
        await conn.commit()


router = APIRouter(tags=["stream"])


@router.get("/stream")
async def stream(request: Request) -> EventSourceResponse:
    """One long-lived SSE connection carrying every live event."""
    global _active_streams

    async def gen() -> AsyncGenerator[dict[str, str], None]:
        global _active_streams
        if _active_streams >= _MAX_STREAMS:
            yield {
                "event": "error",
                "data": '{"kind":"error","reason":"too_many_streams"}',
            }
            return
        _active_streams += 1
        conn = await asyncpg.connect(_raw_dsn())
        queue: asyncio.Queue[str] = asyncio.Queue()

        def on_notify(_c: Any, _pid: int, _chan: str, payload: str) -> None:
            queue.put_nowait(payload)

        await conn.add_listener(CHANNEL, on_notify)
        # Tell the client we're live so it can do an initial sync.
        yield {"data": '{"kind":"connected"}'}
        try:
            while True:
                if await request.is_disconnected():
                    break
                try:
                    payload = await asyncio.wait_for(queue.get(), timeout=15.0)
                except asyncio.TimeoutError:
                    continue  # loop; sse-starlette emits its own keepalive ping
                yield {"data": payload}
        finally:
            try:
                await conn.remove_listener(CHANNEL, on_notify)
                await conn.close()
            except Exception:  # noqa: BLE001 — best-effort cleanup
                log.debug("stream cleanup failed", exc_info=True)
            _active_streams -= 1

    return EventSourceResponse(gen())
