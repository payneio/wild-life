"""Device ingest: raw observations posted by a tracker on the phone.

The browser cannot do this. The Geolocation API is not exposed to service workers
and ``watchPosition`` stops the moment the page is backgrounded or the screen locks,
so background tracking needs a native producer. OwnTracks is that producer, and it
speaks HTTP: one JSON message per POST, HTTP Basic for auth (see ``auth.py``), and a
JSON array in the reply.

**The rule that governs this whole module: always answer 200 with ``[]``.** OwnTracks
retries any non-2xx, so a single message we consider malformed would become an
infinite retry loop on a battery-powered device. Every failure here is logged and
swallowed. The only thing an error response would buy us is the loss of every
subsequent ping.
"""

import json
import logging
from typing import Any

from fastapi import APIRouter, Depends, Request
from sqlalchemy.dialects.postgresql import insert as pg_insert
from sqlalchemy.ext.asyncio import AsyncSession

from wild_life.db.session import get_session
from wild_life.geofence import Fix, evaluate_ping
from wild_life.models.locations import LocationPing
from wild_life.schemas.ingest import (
    OwnTracksLocation,
    OwnTracksTransition,
    ping_values,
    recorded_at_from_tst,
)

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/ingest", tags=["ingest"])

# A location message is a few hundred bytes; a waypoints export can be larger but we
# ignore those anyway. Generous enough to never clip a real payload, small enough
# that a wedged client cannot post a gigabyte.
MAX_BODY_BYTES = 64 * 1024

# _type values we store. Everything else (waypoints, lwt, status, beacon, cmd,
# encrypted) is acknowledged and dropped.
_PARSERS = {"location": OwnTracksLocation, "transition": OwnTracksTransition}


def _device_id(request: Request, payload: dict[str, Any]) -> str:
    """Stable per-device key, used with ``recorded_at`` to make ingest idempotent.

    ``X-Limit-D`` is the device name OwnTracks sends when configured; ``?d=`` is the
    URL-parameter form of the same thing. ``tid`` is the two-character tracker id and
    is always present in HTTP mode, so it is a reliable last resort.
    """
    header = request.headers.get("x-limit-d")
    query = request.query_params.get("d")
    tid = payload.get("tid")
    for value in (header, query, tid):
        if isinstance(value, str) and value.strip():
            return value.strip()[:64]
    return "unknown"


@router.post("/owntracks", operation_id="ingest_owntracks")
async def ingest_owntracks(
    request: Request, session: AsyncSession = Depends(get_session)
) -> list[dict[str, Any]]:
    """Store one OwnTracks message. Always succeeds, by design.

    The reply is the empty array OwnTracks expects; we never push friends,
    commands or cards back down.
    """
    body = await request.body()
    if len(body) > MAX_BODY_BYTES:
        logger.warning("ingest: body of %d bytes rejected", len(body))
        return []

    try:
        payload = json.loads(body)
    except (json.JSONDecodeError, UnicodeDecodeError):
        logger.warning("ingest: unparseable body")
        return []
    if not isinstance(payload, dict):
        logger.warning("ingest: payload was %s, not an object", type(payload).__name__)
        return []

    parser = _PARSERS.get(payload.get("_type", ""))
    if parser is None:
        return []  # a type we deliberately ignore — not worth a log line

    try:
        message = parser.model_validate(payload)
    except ValueError as exc:
        logger.warning("ingest: %s failed validation: %s", payload.get("_type"), exc)
        return []

    recorded_at = recorded_at_from_tst(message.tst)
    if recorded_at is None:
        logger.warning("ingest: implausible tst %r — clock skew?", message.tst)
        return []

    values = ping_values(
        message,
        device_id=_device_id(request, payload),
        recorded_at=recorded_at,
        raw=payload,
    )

    # Core insert, not the ORM: it is the only way to express ON CONFLICT, and it
    # keeps the write out of the audit listener's unit of work. (LocationPing is
    # audit-exempt anyway — this is belt and braces, not the mechanism.)
    ping_id = await session.scalar(
        pg_insert(LocationPing)
        .values(**values)
        .on_conflict_do_nothing(constraint="ux_location_pings_device_time")
        .returning(LocationPing.id)
    )
    if ping_id is None:
        return []  # a re-delivery we have already seen

    if values["message_type"] == "location":
        # Fold it into the open visits. Wrapped because the whole point of this
        # endpoint is that nothing makes it fail: a bug in the state machine must
        # not turn into a retry loop on the phone, and the tick's replay will
        # re-derive this window anyway.
        try:
            await evaluate_ping(
                session,
                Fix(
                    id=ping_id,
                    recorded_at=recorded_at,
                    latitude=message.lat,
                    longitude=message.lon,
                    accuracy_m=message.acc,
                ),
            )
        except Exception:
            logger.exception("ingest: fence evaluation failed for ping %s", ping_id)
    return []
