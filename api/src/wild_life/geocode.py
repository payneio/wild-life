"""Turning a coordinate into an address, once.

This is the only place in the feature where data leaves the box, and the design
is shaped around keeping it that way:

- It runs **only when you press Promote** — a deliberate act on one place. There
  is no background enrichment pass and there must never be one.
- The coordinate is rounded to ~11 m before it is sent or cached.
- Results are kept forever, so a place is looked up once, ever.
- ``geocode_enabled = false`` turns it off entirely; promoting then simply asks
  you to type a name.

A failure here must never fail the promote. You are sitting in the dialog with
the map in front of you; a missing name is a minor inconvenience, a lost place is
not.
"""

import logging
from typing import Any

import httpx
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from wild_life.config import settings
from wild_life.models.locations import GeocodeCache

logger = logging.getLogger(__name__)

PROVIDER = "nominatim"


def coord_key(lat: float, lon: float) -> str:
    """Cache key: 4 decimal places, about 11 m — a building, not a doorway."""
    return f"{lat:.4f},{lon:.4f}"


def _name_from(address: dict[str, Any], display_name: str | None) -> str | None:
    """The most place-like label the response offers.

    Preference order matters: a venue's own name beats its street address, which
    beats the comma-salad of a full display name.
    """
    for key in ("amenity", "shop", "office", "building", "leisure", "tourism"):
        value = address.get(key)
        if isinstance(value, str) and value.strip():
            return value.strip()
    road = address.get("road")
    if isinstance(road, str) and road.strip():
        number = address.get("house_number")
        return f"{number} {road}".strip() if number else road.strip()
    if display_name:
        return display_name.split(",")[0].strip()
    return None


def to_address(hit: GeocodeCache | None) -> dict[str, str | None]:
    """A cache row as the shared postal-address components.

    The mapping is where Nominatim's vocabulary meets ours: it splits the street
    line into ``house_number`` and ``road``, which we join, and it has no notion
    of a unit — so that stays yours to fill in.
    """
    if hit is None:
        return {}
    street = " ".join(p for p in (hit.house_number, hit.road) if p) or None
    return {
        "street": street,
        "city": hit.city,
        "region": hit.region,
        "postcode": hit.postcode,
        "country": hit.country,
    }


async def reverse(session: AsyncSession, lat: float, lon: float) -> GeocodeCache | None:
    """Look up a coordinate, from cache if we can, over the network if we must."""
    key = coord_key(lat, lon)
    cached = (
        await session.execute(
            select(GeocodeCache)
            .where(GeocodeCache.provider == PROVIDER)
            .where(GeocodeCache.coord_key == key)
        )
    ).scalar_one_or_none()
    if cached is not None:
        return cached
    if not settings.geocode_enabled:
        return None

    try:
        async with httpx.AsyncClient(
            timeout=settings.geocode_timeout_seconds
        ) as client:
            response = await client.get(
                settings.geocode_url,
                params={
                    "format": "jsonv2",
                    "lat": f"{lat:.5f}",
                    "lon": f"{lon:.5f}",
                    "zoom": 18,
                    "addressdetails": 1,
                },
                # Required by the OSM usage policy; a generic agent gets blocked.
                headers={"User-Agent": settings.geocode_user_agent},
            )
            response.raise_for_status()
            payload = response.json()
    except (httpx.HTTPError, ValueError) as exc:
        logger.warning("geocode: lookup failed for %s: %s", key, exc)
        return None

    if not isinstance(payload, dict) or "error" in payload:
        logger.warning("geocode: no result for %s", key)
        return None

    address = payload.get("address") or {}
    row = GeocodeCache(
        provider=PROVIDER,
        coord_key=key,
        display_name=payload.get("display_name"),
        name=_name_from(address, payload.get("display_name")),
        house_number=address.get("house_number"),
        road=address.get("road"),
        # Nominatim spreads the settlement across several keys depending on how
        # the area is administratively carved up.
        city=address.get("city") or address.get("town") or address.get("village"),
        # `region` is vCard's own name for this component, and it is deliberately
        # vague: a state in the US, a province in Canada, a county in the UK.
        # Nominatim reports whichever the local administrative carve-up uses, so
        # prefer state and fall back to county rather than inventing a rule.
        region=address.get("state") or address.get("county"),
        postcode=address.get("postcode"),
        country=address.get("country"),
        raw=payload,
    )
    session.add(row)
    return row
