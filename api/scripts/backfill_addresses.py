"""One-off backfill: split free-text addresses into components, and look up the rest.

Two passes, run with `--dry-run` first (the default):

1. **Parse** the free text already stored in `street` on locations and
   organizations, and in each person's address entries, into the shared postal
   vocabulary. Splitting is conservative: anything the rules cannot place stays
   in `street` rather than being guessed into a field where it would look
   authoritative and be wrong.

2. **Look up** locations that have a name but no address at all. Only names
   specific enough to identify a place are tried, and only unambiguous results
   are written — the rest are reported for a human to decide.

Coordinates are deliberately *not* set by this script. Writing a coordinate arms
a geofence, and arming seventy of them from guessed matches would fill the visit
history with places you never went. Placing a pin stays a deliberate act.

    uv run python scripts/backfill_addresses.py            # report only
    uv run python scripts/backfill_addresses.py --apply    # write
"""

from __future__ import annotations

import argparse
import json
import re
import sys
import time
from dataclasses import dataclass, field
from typing import Any

import httpx
from sqlalchemy import create_engine, text

sys.path.insert(0, "src")

from wild_life.config import settings  # noqa: E402

# --- the vocabulary --------------------------------------------------------

US_STATES = {
    "AL",
    "AK",
    "AZ",
    "AR",
    "CA",
    "CO",
    "CT",
    "DE",
    "FL",
    "GA",
    "HI",
    "ID",
    "IL",
    "IN",
    "IA",
    "KS",
    "KY",
    "LA",
    "ME",
    "MD",
    "MA",
    "MI",
    "MN",
    "MS",
    "MO",
    "MT",
    "NE",
    "NV",
    "NH",
    "NJ",
    "NM",
    "NY",
    "NC",
    "ND",
    "OH",
    "OK",
    "OR",
    "PA",
    "RI",
    "SC",
    "SD",
    "TN",
    "TX",
    "UT",
    "VT",
    "VA",
    "WA",
    "WV",
    "WI",
    "WY",
    "DC",
}
CA_PROVINCES = {
    "AB",
    "BC",
    "MB",
    "NB",
    "NL",
    "NS",
    "NT",
    "NU",
    "ON",
    "PE",
    "QC",
    "SK",
    "YT",
}

US_ZIP = re.compile(r"^\d{5}(?:-\d{4})?$")
CA_POST = re.compile(r"^[A-Z]\d[A-Z]\s?\d[A-Z]\d$", re.I)
COUNTRIES = {
    "usa": "United States",
    "us": "United States",
    "u.s.a.": "United States",
    "united states": "United States",
    "canada": "Canada",
    "ca": "Canada",
}

_UNIT_WORDS = r"APT|APARTMENT|SUITE|STE|UNIT|RM|ROOM|FLOOR|FL|BLDG|BUILDING"
# A unit at the tail of a street line. Anchored and keyword-led on purpose: a
# bare trailing number is far more often part of the street than a unit.
UNIT_TAIL = re.compile(
    rf"\s+(?:(?:{_UNIT_WORDS})\.?\s*[A-Za-z0-9\-]+|#\s*[A-Za-z0-9\-]+)$", re.I
)
UNIT_WHOLE = re.compile(
    rf"^(?:(?:{_UNIT_WORDS})\.?\s*[A-Za-z0-9\-]+|#\s*[A-Za-z0-9\-]+)$", re.I
)


@dataclass
class Parsed:
    street: str | None = None
    unit: str | None = None
    city: str | None = None
    region: str | None = None
    postcode: str | None = None
    country: str | None = None
    notes: list[str] = field(default_factory=list)

    def as_dict(self) -> dict[str, str | None]:
        return {
            "street": self.street,
            "unit": self.unit,
            "city": self.city,
            "region": self.region,
            "postcode": self.postcode,
            "country": self.country,
        }


def parse_address(blob: str) -> Parsed:
    """Split one free-text address into components, conservatively."""
    out = Parsed()
    parts = [p.strip() for p in blob.split(",")]
    parts = [p for p in parts if p]
    if not parts:
        return out

    # Trailing country, if it was written out.
    if parts and parts[-1].lower().strip(".") in COUNTRIES:
        out.country = COUNTRIES[parts[-1].lower().strip(".")]
        parts.pop()

    # Trailing "WA 98052-6291" / "BC V5X 2S4" / "WA" / "98052".
    if parts:
        tail = parts[-1]
        tokens = tail.split()
        if len(tokens) >= 2 and tokens[0].upper() in US_STATES | CA_PROVINCES:
            code = " ".join(tokens[1:])
            if US_ZIP.match(code) or CA_POST.match(code):
                out.region, out.postcode = tokens[0].upper(), code
                parts.pop()
        elif len(tokens) == 1:
            if tokens[0].upper() in US_STATES | CA_PROVINCES:
                out.region = tokens[0].upper()
                parts.pop()
            elif US_ZIP.match(tokens[0]) or CA_POST.match(tokens[0]):
                out.postcode = tokens[0]
                parts.pop()

    # A country is implied by an unambiguous state/province, and only then.
    if out.region and not out.country:
        if out.region in US_STATES:
            out.country = "United States"
        elif out.region in CA_PROVINCES:
            out.country = "Canada"

    # A trailing part that is plainly a unit is a unit, not a city — "13000
    # Linden Ave N, Apt 507" would otherwise put "Apt 507" in the city field.
    if parts and UNIT_WHOLE.match(parts[-1]):
        out.unit = parts.pop()

    # City is the last remaining part, but only when a street precedes it.
    if len(parts) >= 2:
        out.city = parts.pop()

    # Any comma still here is a separator we re-introduced by joining, or one the
    # source left dangling with no field after it. Either way it separates
    # nothing once the components are split out, so it goes. (Note this is the
    # opposite of the format migration's rule, where preserving bytes exactly was
    # the contract — here splitting on commas is the whole job.)
    street = ", ".join(parts).strip()
    if street and not out.unit:
        match = UNIT_TAIL.search(street)
        if match:
            out.unit = match.group(0).strip()
            street = street[: match.start()]
    out.street = street.strip().rstrip(",").strip() or None

    if out.street and not out.city and not out.region:
        out.notes.append("street only — no city or state in the source")
    return out


# --- pass 2: look up a place by name ---------------------------------------

# Names that identify nothing on their own. Rather than guess, they are reported.
VAGUE = {
    "sb",
    "sea",
    "the hill",
    "the sound",
    "imperial",
    "jupiter",
    "lincoln",
    "screwdriver",
    "haymarket",
    "boom city",
    "harold's",
    "sal's",
    "maude's",
    "buckley's",
    "daman's",
    "long ridge court",
    "mtlake terrace",
}
# Where this dataset plainly lives. Used only to flag matches that landed
# somewhere surprising, never to bias the query itself.
HOME_REGIONS = {"Washington", "Oregon", "California", "Idaho"}


# Places that *are* a region or a country, so they have no city or street and the
# ordinary acceptance rule rejects them. Curated by hand rather than by rule,
# because no rule separates these from the near-misses that share their shape:
# "Green Lake" matches Green Lake County, Wisconsin (it is a Seattle
# neighbourhood), "Santa Fe" matches Argentina, "Flint Creek" matches Oklahoma.
# Each name below was checked against what Nominatim actually returned.
ADMIN_AREAS = {
    "california",
    "england",
    "hawaii",
    "idaho",
    "indiana",
    "nebraska",
    "texas",
    "tokyo",
    "tonga",
    "tulum",
    "lake cushman",
}


def looks_specific(name: str) -> tuple[bool, str]:
    lowered = name.strip().lower()
    if lowered in VAGUE:
        return False, "too ambiguous to identify"
    if len(lowered) <= 3:
        return False, "too short to identify"
    if lowered.startswith("the "):
        return False, "informal shorthand"
    return True, ""


def search(client: httpx.Client, name: str) -> list[dict[str, Any]]:
    response = client.get(
        "https://nominatim.openstreetmap.org/search",
        params={"q": name, "format": "jsonv2", "addressdetails": 1, "limit": 3},
        headers={"User-Agent": settings.geocode_user_agent},
    )
    response.raise_for_status()
    payload = response.json()
    return payload if isinstance(payload, list) else []


def components(hit: dict[str, Any]) -> Parsed:
    address = hit.get("address") or {}
    number, road = address.get("house_number"), address.get("road")
    return Parsed(
        street=" ".join(p for p in (number, road) if p) or None,
        city=address.get("city") or address.get("town") or address.get("village"),
        region=address.get("state"),
        postcode=address.get("postcode"),
        country=address.get("country"),
    )


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("--apply", action="store_true", help="write (default: report only)")
    ap.add_argument("--skip-lookup", action="store_true", help="pass 1 only")
    args = ap.parse_args()

    engine = create_engine(settings.sync_database_url)
    report: dict[str, list] = {"parsed": [], "looked_up": [], "skipped": []}

    with engine.begin() as conn:
        # --- pass 1: parse what is already there -----------------------------
        for table in ("locations", "organizations"):
            rows = (
                conn.execute(
                    text(
                        f"SELECT id, name, street FROM wild_life.{table} "
                        "WHERE street IS NOT NULL AND city IS NULL"
                    )
                )
                .mappings()
                .all()
            )
            for row in rows:
                parsed = parse_address(row["street"])
                report["parsed"].append(
                    {
                        "kind": table,
                        "name": row["name"],
                        "from": row["street"],
                        "to": parsed.as_dict(),
                        "notes": parsed.notes,
                    }
                )
                if args.apply:
                    conn.execute(
                        text(
                            f"UPDATE wild_life.{table} SET street=:street, unit=:unit, "
                            "city=:city, region=:region, postcode=:postcode, "
                            "country=:country WHERE id=:id"
                        ),
                        {**parsed.as_dict(), "id": row["id"]},
                    )

        people = (
            conn.execute(
                text(
                    "SELECT id, name, addresses FROM wild_life.people "
                    "WHERE jsonb_array_length(addresses) > 0"
                )
            )
            .mappings()
            .all()
        )
        for person in people:
            rebuilt = []
            changed = False
            for entry in person["addresses"]:
                if entry.get("city") or not entry.get("street"):
                    rebuilt.append(entry)
                    continue
                parsed = parse_address(entry["street"])
                merged = {k: v for k, v in parsed.as_dict().items() if v}
                if entry.get("label"):
                    merged["label"] = entry["label"]
                rebuilt.append(merged)
                changed = True
                report["parsed"].append(
                    {
                        "kind": "person",
                        "name": person["name"],
                        "from": entry["street"],
                        "to": parsed.as_dict(),
                        "notes": parsed.notes,
                    }
                )
            if changed and args.apply:
                conn.execute(
                    text("UPDATE wild_life.people SET addresses=:a WHERE id=:id"),
                    {"a": json.dumps(rebuilt), "id": person["id"]},
                )

        # --- pass 2: look up locations with nothing but a name ---------------
        if not args.skip_lookup:
            blanks = (
                conn.execute(
                    text(
                        "SELECT id, name FROM wild_life.locations "
                        "WHERE street IS NULL AND city IS NULL ORDER BY name"
                    )
                )
                .mappings()
                .all()
            )
            with httpx.Client(timeout=settings.geocode_timeout_seconds) as client:
                for row in blanks:
                    ok, why = looks_specific(row["name"])
                    if not ok:
                        report["skipped"].append({"name": row["name"], "why": why})
                        continue
                    # The OSM policy caps this at one request a second.
                    time.sleep(1.1)
                    try:
                        hits = search(client, row["name"])
                    except httpx.HTTPError as exc:
                        report["skipped"].append(
                            {"name": row["name"], "why": f"lookup failed: {exc}"}
                        )
                        continue
                    if not hits:
                        report["skipped"].append(
                            {"name": row["name"], "why": "no match"}
                        )
                        continue

                    parsed = components(hits[0])
                    is_area = row["name"].strip().lower() in ADMIN_AREAS
                    if is_area and (parsed.region or parsed.country):
                        # A region or a country: keep what it has and skip the
                        # city/street and home-area checks, which do not apply.
                        report["looked_up"].append(
                            {
                                "name": row["name"],
                                "matched": hits[0].get("display_name"),
                                "to": parsed.as_dict(),
                                "alternatives": [],
                            }
                        )
                        if args.apply:
                            conn.execute(
                                text(
                                    "UPDATE wild_life.locations SET city=:city, "
                                    "region=:region, country=:country WHERE id=:id"
                                ),
                                {
                                    "city": parsed.city,
                                    "region": parsed.region,
                                    "country": parsed.country,
                                    "id": row["id"],
                                },
                            )
                        continue
                    if not (parsed.city or parsed.street):
                        report["skipped"].append(
                            {
                                "name": row["name"],
                                "why": "match had no address detail",
                                "matched": hits[0].get("display_name"),
                            }
                        )
                        continue

                    # A city match carries whichever of its postcodes the index
                    # happened to return, which is arbitrary and sometimes plain
                    # wrong ("Crescent City, California, 75531" — a Texas ZIP). A
                    # postcode only means something alongside a street.
                    if not parsed.street:
                        parsed.postcode = None

                    # Landing outside the regions this dataset plainly lives in
                    # means the name was not distinctive after all: "Georgetown"
                    # resolved to Guyana, "Golden Gardens" to Illinois. Report
                    # those rather than writing a confident wrong answer.
                    if parsed.region not in HOME_REGIONS:
                        report["skipped"].append(
                            {
                                "name": row["name"],
                                "why": "matched outside the usual area — name is ambiguous",
                                "matched": hits[0].get("display_name"),
                            }
                        )
                        continue

                    entry = {
                        "name": row["name"],
                        "matched": hits[0].get("display_name"),
                        "to": parsed.as_dict(),
                        "alternatives": [h.get("display_name") for h in hits[1:]],
                    }
                    report["looked_up"].append(entry)
                    if args.apply:
                        conn.execute(
                            text(
                                "UPDATE wild_life.locations SET street=:street, unit=:unit, "
                                "city=:city, region=:region, postcode=:postcode, "
                                "country=:country WHERE id=:id"
                            ),
                            {**parsed.as_dict(), "id": row["id"]},
                        )

        if not args.apply:
            conn.rollback()

    print(json.dumps(report, indent=1))
    print(
        f"\nparsed={len(report['parsed'])} "
        f"looked_up={len(report['looked_up'])} skipped={len(report['skipped'])} "
        f"({'APPLIED' if args.apply else 'dry run — nothing written'})",
        file=sys.stderr,
    )


if __name__ == "__main__":
    main()
