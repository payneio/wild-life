"""Locations: physical places, and the observations that place you inside them.

Four tables in three tiers, and the tiering is the whole design:

- **Observation** — ``LocationPing`` is what the phone saw. Append-only, never
  audited, not an entity. It is the only tier that cannot be recomputed.
- **Derivation** — ``LocationVisit`` and ``PlaceCandidate`` are what the algorithm
  concluded. Both are a pure function of (pings, locations), so both can be dropped
  and rebuilt at any time. That is what makes it safe to change a radius, add a
  Location retroactively, or fix the clustering later.
- **Entity** — ``Location`` is what *you* decided. Human intent, never derived.

Nesting is derived, not declared: there is no ``parent_id``, because "inside" is
just ``distance <= radius``. You are in every circle that contains you — Washington,
Seattle, Capitol Hill and the office all at once — so containment can never
disagree with the geometry.
"""

import uuid
from datetime import datetime
from typing import Any

from sqlalchemy import (
    BigInteger,
    DateTime,
    Double,
    ForeignKey,
    Identity,
    Index,
    Integer,
    Text,
    UniqueConstraint,
    func,
    text,
)
from sqlalchemy.dialects.postgresql import JSONB, UUID
from sqlalchemy.orm import Mapped, mapped_column

from wild_life.db.base import Base
from wild_life.models.mixins import TimestampMixin, UUIDPrimaryKey


class Location(UUIDPrimaryKey, TimestampMixin, Base):
    """A place people, events, and journal entries relate to."""

    __tablename__ = "locations"

    name: Mapped[str] = mapped_column(Text, nullable=False)
    category: Mapped[str | None] = mapped_column(Text)  # home/work/venue/city/other

    # The shared postal-address vocabulary — see schemas/common.PostalAddress for
    # what each component means and which standards they come from. Columns
    # rather than a JSON blob because city and region are searched, sorted and
    # shown as list columns.
    street: Mapped[str | None] = mapped_column(Text)
    unit: Mapped[str | None] = mapped_column(Text)
    city: Mapped[str | None] = mapped_column(Text)
    region: Mapped[str | None] = mapped_column(Text)
    postcode: Mapped[str | None] = mapped_column(Text)
    country: Mapped[str | None] = mapped_column(Text)

    notes: Mapped[str | None] = mapped_column(Text)

    # Geofence. `Double` (float8) rather than `Float`: float4's ~7 significant
    # digits land at roughly a metre of longitude, the same order as the smallest
    # fences we draw. The fence is *active* iff both coordinates are set — radius_m
    # is never null so the evaluator and the UI slider never have to coalesce, and
    # a Location can still be a pure text place.
    latitude: Mapped[float | None] = mapped_column(Double)
    longitude: Mapped[float | None] = mapped_column(Double)
    radius_m: Mapped[float] = mapped_column(
        Double, server_default="150", nullable=False
    )

    # Set when the fence moves; the tick re-derives this location's whole visit
    # history and clears it. Internal bookkeeping — never rendered. The detail view
    # autosaves keystroke by keystroke, so PATCH marks work to do rather than doing
    # it.
    geo_dirty_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))


class LocationPing(Base):
    """One position report from a device. Raw, high-volume, append-only.

    Deliberately *not* a ``UUIDPrimaryKey``. The UUID convention exists so entities
    have a stable id for the soft-polymorphic ``entity_type``/``entity_id`` pairs;
    nothing will ever point at a ping that way. A random UUIDv4 also scatters
    inserts across the whole btree keyspace, where a monotonic bigint only ever
    appends — at six figures of rows a year that is the difference between a
    compact index and a bloated one, at half the width.
    """

    __tablename__ = "location_pings"

    # Opt out of change tracking (see db/audit.py). One change_log row per ping
    # would carry a full JSONB snapshot — including `raw` — so auditing would cost
    # more storage than the pings themselves, and would pg_notify every open SSE
    # stream at device ping rate.
    __audit__ = False

    __table_args__ = (
        # OwnTracks re-delivers queued messages after a network failure, so ingest
        # is idempotent on this key. `tst` is second-resolution; the only thing it
        # can lose is two genuinely distinct fixes from one device in the same
        # second, which no tracker emits.
        UniqueConstraint(
            "device_id", "recorded_at", name="ux_location_pings_device_time"
        ),
    )

    id: Mapped[int] = mapped_column(BigInteger, Identity(), primary_key=True)
    device_id: Mapped[str] = mapped_column(Text, nullable=False)  # OwnTracks tid

    # When the fix was taken, per the device. Every replay and every timeline query
    # is a range over this.
    recorded_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False, index=True
    )
    # When we stored it. The gap against recorded_at is how backfill and clock skew
    # become visible instead of silently corrupting the timeline.
    received_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), nullable=False
    )

    latitude: Mapped[float] = mapped_column(Double, nullable=False)
    longitude: Mapped[float] = mapped_column(Double, nullable=False)
    accuracy_m: Mapped[float | None] = mapped_column(Double)  # acc
    altitude_m: Mapped[float | None] = mapped_column(Double)  # alt
    velocity_kmh: Mapped[float | None] = mapped_column(Double)  # vel
    course_deg: Mapped[float | None] = mapped_column(Double)  # cog
    battery_pct: Mapped[int | None] = mapped_column(Integer)  # batt
    battery_state: Mapped[int | None] = mapped_column(Integer)  # bs
    trigger: Mapped[str | None] = mapped_column(Text)  # t: p=ping, c=region, u=manual
    connection: Mapped[str | None] = mapped_column(Text)  # conn: w/m/o

    # `location` or `transition`. Device-side regions are unused, so transitions are
    # stored and never acted on — storing is free, discarding is irreversible.
    message_type: Mapped[str] = mapped_column(
        Text, server_default="location", nullable=False
    )
    transition_event: Mapped[str | None] = mapped_column(Text)  # enter | leave

    # The original payload, whole. The only lossless record, and what any future
    # reprocessing reads — worth more than the bytes it costs.
    raw: Mapped[dict[str, Any]] = mapped_column(
        JSONB, server_default="{}", nullable=False
    )


class LocationVisit(UUIDPrimaryKey, TimestampMixin, Base):
    """A stretch of time spent inside one location's fence.

    Derived from pings and rebuildable from them, with one exception: rows whose
    ``source`` is not ``derived`` were entered by hand ("I was at Mom's, no phone"),
    and a rebuild must leave them alone.
    """

    __tablename__ = "location_visits"

    __table_args__ = (
        # At most one *open* visit per location, but any number of concurrent open
        # visits across different (nested) locations. This is the nesting rule
        # stated as a constraint rather than trusted to the state machine.
        Index(
            "ux_location_visits_open",
            "location_id",
            unique=True,
            postgresql_where=text("exited_at IS NULL"),
        ),
    )

    location_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("locations.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    entered_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False, index=True
    )
    # Null means you are inside right now.
    exited_at: Mapped[datetime | None] = mapped_column(
        DateTime(timezone=True), index=True
    )

    # Exit-hysteresis bookkeeping. These change on *every* ping while you are inside
    # a fence, so they are written with Core update() and never through the ORM —
    # inside four nested fences, ORM writes would put four change_log rows and four
    # SSE broadcasts on every single ping. See db/audit.py.
    last_seen_inside_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False
    )
    pending_exit_count: Mapped[int] = mapped_column(
        Integer, server_default="0", nullable=False
    )
    ping_count: Mapped[int] = mapped_column(Integer, server_default="0", nullable=False)

    first_ping_id: Mapped[int | None] = mapped_column(BigInteger)
    last_ping_id: Mapped[int | None] = mapped_column(BigInteger)

    # exit | stale | rebuild. `stale` matters for honesty: a phone that died looks
    # exactly like sitting still with tracking off, and the timeline should render
    # that end as uncertain rather than confident.
    close_reason: Mapped[str | None] = mapped_column(Text)
    source: Mapped[str] = mapped_column(Text, server_default="derived", nullable=False)


class PlaceCandidate(UUIDPrimaryKey, TimestampMixin, Base):
    """A recurring stop with no Location yet — the system's proposal.

    A separate table rather than provisional ``Location`` rows on purpose: those
    would pollute every picker, the merge tool's duplicate finder, global search,
    and — worst — the answer to "where was I", which is the point of the feature.
    """

    __tablename__ = "place_candidates"

    __table_args__ = (
        # The review queue: undecided candidates, most recent first.
        Index(
            "ix_place_candidates_open",
            text("last_seen_at DESC"),
            postgresql_where=text(
                "dismissed_at IS NULL AND promoted_location_id IS NULL"
            ),
        ),
    )

    centroid_lat: Mapped[float] = mapped_column(Double, nullable=False)
    centroid_lon: Mapped[float] = mapped_column(Double, nullable=False)
    radius_m: Mapped[float] = mapped_column(Double, nullable=False)

    stop_count: Mapped[int] = mapped_column(Integer, server_default="0", nullable=False)
    # Cumulative dwell ranks candidates far better than a stop count does: one
    # eight-hour stop matters more than five three-minute ones.
    total_seconds: Mapped[int] = mapped_column(
        BigInteger, server_default="0", nullable=False
    )

    first_seen_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False
    )
    last_seen_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False
    )

    # Both nullable timestamps rather than a status column — matching completed_at
    # and revoked_at elsewhere, and keeping a derived object out of lifecycle.py,
    # which is for things that actually have a lifecycle.
    dismissed_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    promoted_location_id: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True), ForeignKey("locations.id", ondelete="SET NULL"), index=True
    )

    # Cached reverse-geocode display name, so the review queue can show a hint
    # without a lookup per card.
    label_hint: Mapped[str | None] = mapped_column(Text)


class GeocodeCache(UUIDPrimaryKey, Base):
    """Reverse-geocode results, kept forever.

    Coordinates only leave this box through this table's misses, and only when you
    press Promote. Caching means a place is looked up once, ever.
    """

    __tablename__ = "geocode_cache"

    __table_args__ = (
        UniqueConstraint("provider", "coord_key", name="ux_geocode_cache_key"),
    )

    provider: Mapped[str] = mapped_column(
        Text, server_default="nominatim", nullable=False
    )
    # Centroid rounded to 4 decimal places (~11 m) — precise enough to identify a
    # building, coarse enough that near-identical promotes share one lookup.
    coord_key: Mapped[str] = mapped_column(Text, nullable=False)

    display_name: Mapped[str | None] = mapped_column(Text)
    name: Mapped[str | None] = mapped_column(Text)
    house_number: Mapped[str | None] = mapped_column(Text)
    road: Mapped[str | None] = mapped_column(Text)
    city: Mapped[str | None] = mapped_column(Text)
    region: Mapped[str | None] = mapped_column(Text)
    postcode: Mapped[str | None] = mapped_column(Text)
    country: Mapped[str | None] = mapped_column(Text)

    raw: Mapped[dict[str, Any]] = mapped_column(
        JSONB, server_default="{}", nullable=False
    )
    fetched_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), nullable=False
    )
