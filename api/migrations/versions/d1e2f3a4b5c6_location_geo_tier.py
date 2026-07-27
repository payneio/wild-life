"""give locations a geofence, and add the observation/derivation tiers beneath them

Locations were six text columns with no coordinates and no inbound reference — a
notes-with-a-name entity. This gives them a fence (`latitude`/`longitude`/`radius_m`)
and adds the three tables that turn a phone's position reports into something the
rest of the app can ask questions of.

The tiering is the point, and the schema is where it is enforced:

- `location_pings` is observation. Append-only, audit-exempt (see db/audit.py), with
  a unique `(device_id, recorded_at)` so a tracker re-delivering a queued message is
  a no-op rather than a duplicate. It is the only tier that cannot be recomputed.
- `location_visits` and `place_candidates` are derivation — a pure function of pings
  and fences, safe to drop and rebuild whenever a radius moves. The partial unique
  index on `location_visits` is the nesting rule stated as a constraint: at most one
  *open* visit per location, and any number across nested locations, because being
  inside Seattle and inside the office at the same time is the normal case.
- `locations` stays yours.

`geocode_cache` is separate from all three: it is a memo of an external lookup, kept
forever so a place is reverse-geocoded once, ever.

Revision ID: d1e2f3a4b5c6
Revises: c0d1e2f3a4b5
Create Date: 2026-07-27
"""

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects import postgresql

revision: str = "d1e2f3a4b5c6"
down_revision: str | None = "c0d1e2f3a4b5"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    # --- locations: the fence -------------------------------------------------
    # float8, not float4: ~7 significant digits is about a metre of longitude,
    # which is the same order as the smallest fences we draw.
    op.add_column(
        "locations",
        sa.Column("latitude", sa.Double(), nullable=True),
        schema="wild_life",
    )
    op.add_column(
        "locations",
        sa.Column("longitude", sa.Double(), nullable=True),
        schema="wild_life",
    )
    # Never null so the evaluator and the UI slider never have to coalesce; the
    # fence is *active* only once both coordinates are set, so backfilling every
    # existing row with 150 m arms nothing.
    op.add_column(
        "locations",
        sa.Column(
            "radius_m", sa.Double(), server_default=sa.text("150"), nullable=False
        ),
        schema="wild_life",
    )
    op.add_column(
        "locations",
        sa.Column("geo_dirty_at", sa.DateTime(timezone=True), nullable=True),
        schema="wild_life",
    )

    # --- location_pings: observation -----------------------------------------
    op.create_table(
        "location_pings",
        sa.Column("id", sa.BigInteger(), sa.Identity(always=False), primary_key=True),
        sa.Column("device_id", sa.Text(), nullable=False),
        sa.Column("recorded_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column(
            "received_at",
            sa.DateTime(timezone=True),
            server_default=sa.text("now()"),
            nullable=False,
        ),
        sa.Column("latitude", sa.Double(), nullable=False),
        sa.Column("longitude", sa.Double(), nullable=False),
        sa.Column("accuracy_m", sa.Double(), nullable=True),
        sa.Column("altitude_m", sa.Double(), nullable=True),
        sa.Column("velocity_kmh", sa.Double(), nullable=True),
        sa.Column("course_deg", sa.Double(), nullable=True),
        sa.Column("battery_pct", sa.Integer(), nullable=True),
        sa.Column("battery_state", sa.Integer(), nullable=True),
        sa.Column("trigger", sa.Text(), nullable=True),
        sa.Column("connection", sa.Text(), nullable=True),
        sa.Column(
            "message_type",
            sa.Text(),
            server_default=sa.text("'location'"),
            nullable=False,
        ),
        sa.Column("transition_event", sa.Text(), nullable=True),
        sa.Column(
            "raw",
            postgresql.JSONB(astext_type=sa.Text()),
            server_default=sa.text("'{}'"),
            nullable=False,
        ),
        sa.UniqueConstraint(
            "device_id", "recorded_at", name="ux_location_pings_device_time"
        ),
        schema="wild_life",
    )
    op.create_index(
        "ix_wild_life_location_pings_recorded_at",
        "location_pings",
        ["recorded_at"],
        schema="wild_life",
    )

    # --- location_visits: derivation -----------------------------------------
    op.create_table(
        "location_visits",
        sa.Column(
            "id",
            postgresql.UUID(as_uuid=True),
            server_default=sa.text("gen_random_uuid()"),
            primary_key=True,
        ),
        sa.Column("location_id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("entered_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("exited_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("last_seen_inside_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column(
            "pending_exit_count",
            sa.Integer(),
            server_default=sa.text("0"),
            nullable=False,
        ),
        sa.Column(
            "ping_count", sa.Integer(), server_default=sa.text("0"), nullable=False
        ),
        sa.Column("first_ping_id", sa.BigInteger(), nullable=True),
        sa.Column("last_ping_id", sa.BigInteger(), nullable=True),
        sa.Column("close_reason", sa.Text(), nullable=True),
        sa.Column(
            "source", sa.Text(), server_default=sa.text("'derived'"), nullable=False
        ),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            server_default=sa.text("now()"),
            nullable=False,
        ),
        sa.Column(
            "updated_at",
            sa.DateTime(timezone=True),
            server_default=sa.text("now()"),
            nullable=False,
        ),
        sa.ForeignKeyConstraint(
            ["location_id"], ["wild_life.locations.id"], ondelete="CASCADE"
        ),
        schema="wild_life",
    )
    op.create_index(
        "ix_wild_life_location_visits_location_id",
        "location_visits",
        ["location_id"],
        schema="wild_life",
    )
    op.create_index(
        "ix_wild_life_location_visits_entered_at",
        "location_visits",
        ["entered_at"],
        schema="wild_life",
    )
    op.create_index(
        "ix_wild_life_location_visits_exited_at",
        "location_visits",
        ["exited_at"],
        schema="wild_life",
    )
    # One open visit per location; unlimited concurrent open visits across nested
    # locations. Enforced here rather than in the state machine.
    op.create_index(
        "ux_location_visits_open",
        "location_visits",
        ["location_id"],
        unique=True,
        postgresql_where=sa.text("exited_at IS NULL"),
        schema="wild_life",
    )

    # --- place_candidates: derivation ----------------------------------------
    op.create_table(
        "place_candidates",
        sa.Column(
            "id",
            postgresql.UUID(as_uuid=True),
            server_default=sa.text("gen_random_uuid()"),
            primary_key=True,
        ),
        sa.Column("centroid_lat", sa.Double(), nullable=False),
        sa.Column("centroid_lon", sa.Double(), nullable=False),
        sa.Column("radius_m", sa.Double(), nullable=False),
        sa.Column(
            "stop_count", sa.Integer(), server_default=sa.text("0"), nullable=False
        ),
        sa.Column(
            "total_seconds",
            sa.BigInteger(),
            server_default=sa.text("0"),
            nullable=False,
        ),
        sa.Column("first_seen_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("last_seen_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("dismissed_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("promoted_location_id", postgresql.UUID(as_uuid=True), nullable=True),
        sa.Column("label_hint", sa.Text(), nullable=True),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            server_default=sa.text("now()"),
            nullable=False,
        ),
        sa.Column(
            "updated_at",
            sa.DateTime(timezone=True),
            server_default=sa.text("now()"),
            nullable=False,
        ),
        sa.ForeignKeyConstraint(
            ["promoted_location_id"], ["wild_life.locations.id"], ondelete="SET NULL"
        ),
        schema="wild_life",
    )
    op.create_index(
        "ix_wild_life_place_candidates_promoted_location_id",
        "place_candidates",
        ["promoted_location_id"],
        schema="wild_life",
    )
    # The review queue: undecided candidates, most recent first.
    op.create_index(
        "ix_place_candidates_open",
        "place_candidates",
        [sa.text("last_seen_at DESC")],
        postgresql_where=sa.text(
            "dismissed_at IS NULL AND promoted_location_id IS NULL"
        ),
        schema="wild_life",
    )

    # --- geocode_cache --------------------------------------------------------
    op.create_table(
        "geocode_cache",
        sa.Column(
            "id",
            postgresql.UUID(as_uuid=True),
            server_default=sa.text("gen_random_uuid()"),
            primary_key=True,
        ),
        sa.Column(
            "provider", sa.Text(), server_default=sa.text("'nominatim'"), nullable=False
        ),
        sa.Column("coord_key", sa.Text(), nullable=False),
        sa.Column("display_name", sa.Text(), nullable=True),
        sa.Column("name", sa.Text(), nullable=True),
        sa.Column("house_number", sa.Text(), nullable=True),
        sa.Column("road", sa.Text(), nullable=True),
        sa.Column("city", sa.Text(), nullable=True),
        sa.Column("region", sa.Text(), nullable=True),
        sa.Column("postcode", sa.Text(), nullable=True),
        sa.Column("country", sa.Text(), nullable=True),
        sa.Column(
            "raw",
            postgresql.JSONB(astext_type=sa.Text()),
            server_default=sa.text("'{}'"),
            nullable=False,
        ),
        sa.Column(
            "fetched_at",
            sa.DateTime(timezone=True),
            server_default=sa.text("now()"),
            nullable=False,
        ),
        sa.UniqueConstraint("provider", "coord_key", name="ux_geocode_cache_key"),
        schema="wild_life",
    )


def downgrade() -> None:
    op.drop_table("geocode_cache", schema="wild_life")
    op.drop_table("place_candidates", schema="wild_life")
    op.drop_table("location_visits", schema="wild_life")
    op.drop_table("location_pings", schema="wild_life")
    op.drop_column("locations", "geo_dirty_at", schema="wild_life")
    op.drop_column("locations", "radius_m", schema="wild_life")
    op.drop_column("locations", "longitude", schema="wild_life")
    op.drop_column("locations", "latitude", schema="wild_life")
