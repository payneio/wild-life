"""OwnTracks wire payloads.

These are applied *inside* the handler rather than declared as the route's body
type, on purpose. The endpoint has to answer 2xx to anything (see
``routers/ingest.py``); if FastAPI validated the body itself, a malformed message
would get a 422 and the tracker would retry the same poison payload forever,
draining the phone's battery to do it.

Field names are OwnTracks': https://owntracks.org/booklet/tech/json/
"""

from datetime import datetime, timedelta, timezone
from typing import Any

from pydantic import BaseModel, ConfigDict, Field

# `tst` is epoch seconds. Anything outside this window is a broken clock rather
# than a real fix, and storing it would put a phantom at the edge of every
# timeline query.
TST_MIN = datetime(2020, 1, 1, tzinfo=timezone.utc)
TST_MAX_SKEW = timedelta(days=1)


class OwnTracksMessage(BaseModel):
    """Fields shared by the payloads we store."""

    model_config = ConfigDict(extra="ignore")

    lat: float = Field(ge=-90, le=90)
    lon: float = Field(ge=-180, le=180)
    tst: int
    acc: float | None = None
    tid: str | None = None
    t: str | None = None


class OwnTracksLocation(OwnTracksMessage):
    """``_type: "location"`` — a position report."""

    alt: float | None = None
    vel: float | None = None
    cog: float | None = None
    batt: int | None = None
    bs: int | None = None
    conn: str | None = None


class OwnTracksTransition(OwnTracksMessage):
    """``_type: "transition"`` — a device-side region crossing.

    Stored but never acted on: fences are evaluated server-side so that nesting
    works and so history can be re-derived. Keeping the rows costs nothing and
    discarding them would be irreversible.
    """

    event: str | None = None  # enter | leave
    desc: str | None = None
    rid: str | None = None


def recorded_at_from_tst(tst: int) -> datetime | None:
    """Epoch seconds → aware datetime, or None if the clock is implausible."""
    try:
        moment = datetime.fromtimestamp(tst, tz=timezone.utc)
    except (OverflowError, OSError, ValueError):
        return None
    if moment < TST_MIN or moment > datetime.now(timezone.utc) + TST_MAX_SKEW:
        return None
    return moment


def ping_values(
    message: OwnTracksMessage,
    *,
    device_id: str,
    recorded_at: datetime,
    raw: dict[str, Any],
) -> dict[str, Any]:
    """Wire payload → ``location_pings`` column values."""
    values: dict[str, Any] = {
        "device_id": device_id,
        "recorded_at": recorded_at,
        "latitude": message.lat,
        "longitude": message.lon,
        "accuracy_m": message.acc,
        "trigger": message.t,
        "raw": raw,
    }
    if isinstance(message, OwnTracksLocation):
        values |= {
            "message_type": "location",
            "altitude_m": message.alt,
            "velocity_kmh": message.vel,
            "course_deg": message.cog,
            "battery_pct": message.batt,
            "battery_state": message.bs,
            "connection": message.conn,
        }
    elif isinstance(message, OwnTracksTransition):
        values |= {
            "message_type": "transition",
            "transition_event": message.event,
        }
    return values
