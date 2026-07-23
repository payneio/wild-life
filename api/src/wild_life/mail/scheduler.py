"""In-process calendar-mail poll loop.

Runs the two-way iMIP sync on an interval from inside the API process, so no
external job is needed — the service already owns the Bridge connection and the
DB session. Started/stopped by the app lifespan.

The loop sleeps *before* its first pass, so a short-lived process (e.g. the test
client) never triggers a real send.
"""

from __future__ import annotations

import asyncio
import logging

from wild_life import mail
from wild_life.config import settings
from wild_life.db.session import AsyncSessionLocal
from wild_life.mail.deps import get_transport
from wild_life.routers.calendar_mail import run_mail_tick

log = logging.getLogger("wild_life.mail.scheduler")


async def _run_once() -> None:
    transport = get_transport()
    async with AsyncSessionLocal() as session:
        result = await run_mail_tick(session, transport)
        await session.commit()
    if result.errors:
        log.warning("mail tick finished with %d error(s)", result.errors)


async def poll_loop() -> None:
    """Sleep, then run one tick, forever. Never dies on a transient error."""
    interval = settings.mail_poll_seconds
    while True:
        await asyncio.sleep(interval)
        if not mail.is_enabled():
            continue
        try:
            await _run_once()
        except asyncio.CancelledError:
            raise
        except Exception:  # noqa: BLE001 — a bad pass must not kill the loop
            log.exception("calendar-mail poll pass failed")
