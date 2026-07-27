"""Schemas for reading the observation tier.

Pings are not an entity and have no CRUD surface. These are the two questions the
UI legitimately asks of the raw log: *draw me this day's track*, and *is the
tracker still alive?*
"""

from datetime import datetime

from pydantic import BaseModel


class TrackPoint(BaseModel):
    """One position, stripped to what a polyline needs."""

    id: int
    recorded_at: datetime
    latitude: float
    longitude: float
    accuracy_m: float | None


class IngestStatus(BaseModel):
    """Whether readings are still arriving.

    This exists because the failure mode of the whole feature is silence. The
    tracker is a separate app on a separate device; if it stops running, nothing
    breaks and no error appears — the map simply stops growing, which looks
    identical to staying home. Surfacing the last reading makes that visible.
    """

    last_recorded_at: datetime | None
    last_received_at: datetime | None
    device_id: str | None
    # received_at - recorded_at on the latest reading. A large or growing value
    # means the device is queueing and flushing rather than reporting live —
    # expected off-network, a symptom otherwise.
    delivery_lag_seconds: float | None
    readings_24h: int
    total_readings: int
