#!/usr/bin/env python3
"""One-time (idempotent) import of an iCalendar (.ics) export into personal-api.

Built for migrating off Proton Calendar: export the calendar from
calendar.proton.me (Settings -> Import/export -> Download ICS) and feed the file
here. Each VEVENT becomes a personal-api Event, keyed by its ICS ``UID`` so the
import is idempotent and safe to re-run.

Usage
-----
    # icalendar<7: 7.x has a parameter-parsing regression that crashes on some
    # real Proton exports.
    uv run --with 'icalendar<7' python scripts/import_ics.py calendar.ics --dry-run
    uv run --with 'icalendar<7' python scripts/import_ics.py calendar.ics
    uv run --with 'icalendar<7' python scripts/import_ics.py calendar.ics --update

Notes
-----
- Recurring events are stored as the master VEVENT with its RRULE preserved in
  ``recurrence`` (occurrences are expanded on demand elsewhere). Modified single
  instances (RECURRENCE-ID overrides) get a distinct ``external_ref`` suffix so
  they don't collide with the master.
- ``external_ref`` is the bare iCalendar ``UID`` — the same key the invite-ingest
  path uses — so a calendar event and its emailed invite collapse to one row, and
  re-runs are idempotent. Manually-created events (no external_ref) are untouched.
"""

from __future__ import annotations

import argparse
import subprocess
import sys
from datetime import date, datetime, time
from pathlib import Path
from typing import Any
from zoneinfo import ZoneInfo

import httpx
from icalendar import Calendar

DEFAULT_BASE_URL = "http://localhost:9005"


# --------------------------------------------------------------------------- #
# VEVENT -> EventCreate mapping
# --------------------------------------------------------------------------- #


def _to_aware(value: Any, default_tz: ZoneInfo) -> tuple[datetime, bool]:
    """Return (tz-aware datetime, all_day). Dates become midnight in default_tz."""
    if isinstance(value, datetime):
        if value.tzinfo is None:
            value = value.replace(tzinfo=default_tz)
        return value, False
    if isinstance(value, date):
        return datetime.combine(value, time.min, tzinfo=default_tz), True
    raise TypeError(f"unhandled DTSTART/DTEND type: {type(value)!r}")


def _attendees(vevent: Any) -> list[str]:
    raw = vevent.get("ATTENDEE")
    if raw is None:
        return []
    items = raw if isinstance(raw, list) else [raw]
    out: list[str] = []
    for a in items:
        cn = None
        try:
            cn = a.params.get("CN")
        except AttributeError:
            pass
        addr = str(a).replace("mailto:", "").replace("MAILTO:", "").strip()
        out.append(cn or addr)
    return [x for x in out if x]


def _exdates(vevent: Any) -> list[str]:
    raw = vevent.get("EXDATE")
    if raw is None:
        return []
    groups = raw if isinstance(raw, list) else [raw]
    out: list[str] = []
    for g in groups:
        for d in getattr(g, "dts", []):
            out.append(d.dt.isoformat())
    return out


def vevent_to_payload(vevent: Any, default_tz: ZoneInfo) -> dict[str, Any] | None:
    uid = str(vevent.get("UID") or "").strip()
    if not uid:
        return None

    dtstart = vevent.get("DTSTART")
    if dtstart is None:
        return None
    start_at, all_day = _to_aware(dtstart.dt, default_tz)

    end_at: datetime | None = None
    dtend = vevent.get("DTEND")
    if dtend is not None:
        end_at, _ = _to_aware(dtend.dt, default_tz)
    else:
        dur = vevent.get("DURATION")
        if dur is not None:
            end_at = start_at + dur.dt

    recurrence: str | None = None
    rrule = vevent.get("RRULE")
    if rrule is not None:
        recurrence = rrule.to_ical().decode()

    # external_ref is the bare iCalendar UID (globally unique) — shared with the
    # invite-ingest path so a calendar event and its email invite are one row.
    # RECURRENCE-ID overrides share a UID with their master; keep them distinct.
    external_ref = uid
    recid = vevent.get("RECURRENCE-ID")
    if recid is not None:
        rid_dt, _ = _to_aware(recid.dt, default_tz)
        external_ref = f"{external_ref}::{rid_dt.isoformat()}"

    def s(name: str) -> str | None:
        v = vevent.get(name)
        return str(v) if v is not None else None

    return {
        "title": s("SUMMARY") or "(untitled)",
        "description": s("DESCRIPTION"),
        "location": s("LOCATION"),
        "start_at": start_at.isoformat(),
        "end_at": end_at.isoformat() if end_at else None,
        "all_day": all_day,
        "attendees": _attendees(vevent),
        "recurrence": recurrence,
        "recurrence_exdates": _exdates(vevent),
        "external_ref": external_ref,
    }


# --------------------------------------------------------------------------- #
# Import
# --------------------------------------------------------------------------- #


def get_token(explicit: str | None) -> str:
    if explicit:
        return explicit
    out = subprocess.run(
        ["castle", "secret", "get", "PERSONAL_API_TOKEN"],
        capture_output=True,
        text=True,
    )
    if out.returncode == 0 and out.stdout.strip():
        return out.stdout.strip()
    return "dev-token"


def load_existing(http: httpx.Client) -> dict[str, dict[str, Any]]:
    """Index existing personal-api events by external_ref (UID) for dedup.

    Loads the whole collection once; manually-created events (external_ref null)
    are simply skipped, never matched.
    """
    index: dict[str, dict[str, Any]] = {}
    offset = 0
    limit = 500
    while True:
        r = http.get("/events", params={"limit": limit, "offset": offset})
        r.raise_for_status()
        batch = r.json()
        for ev in batch:
            if ev.get("external_ref"):
                index[ev["external_ref"]] = ev
        if len(batch) < limit:
            break
        offset += limit
    return index


UPDATE_FIELDS = [
    "title",
    "description",
    "location",
    "start_at",
    "end_at",
    "all_day",
    "attendees",
    "recurrence",
    "recurrence_exdates",
]


def main() -> int:
    ap = argparse.ArgumentParser(description=__doc__)
    ap.add_argument("ics", type=Path, help="Path to the exported .ics file")
    ap.add_argument("--base-url", default=DEFAULT_BASE_URL)
    ap.add_argument("--token", default=None)
    ap.add_argument("--dry-run", action="store_true")
    ap.add_argument(
        "--update",
        action="store_true",
        help="Converge fields of events already imported.",
    )
    args = ap.parse_args()

    if not args.ics.exists():
        print(f"ICS file not found: {args.ics}", file=sys.stderr)
        return 1

    cal = Calendar.from_ical(args.ics.read_bytes())
    tzid = str(cal.get("X-WR-TIMEZONE") or "UTC")
    try:
        default_tz = ZoneInfo(tzid)
    except Exception:
        default_tz = ZoneInfo("UTC")

    payloads: list[dict[str, Any]] = []
    for comp in cal.walk("VEVENT"):
        p = vevent_to_payload(comp, default_tz)
        if p is not None:
            payloads.append(p)
    print(f"Parsed {len(payloads)} VEVENT(s) (calendar tz: {tzid})")

    http = httpx.Client(
        base_url=args.base_url.rstrip("/"),
        headers={"Authorization": f"Bearer {get_token(args.token)}"},
        timeout=30.0,
    )
    existing = load_existing(http)
    print(f"{len(existing)} existing event(s) with an external_ref (dedup index)")

    created = skipped = updated = 0
    for p in payloads:
        ref = p["external_ref"]
        prior = existing.get(ref)
        if prior is None:
            if args.dry_run:
                print(f"  + CREATE {p['title']!r} ({ref})")
            else:
                r = http.post("/events", json=p)
                if r.status_code >= 400:
                    raise RuntimeError(f"POST failed {r.status_code}: {r.text}\n{p}")
            created += 1
            continue

        if args.update:
            changed = {
                f: p[f] for f in UPDATE_FIELDS if f in p and prior.get(f) != p[f]
            }
            if changed:
                if args.dry_run:
                    print(f"  ~ UPDATE {p['title']!r} ({ref}): {sorted(changed)}")
                else:
                    r = http.patch(f"/events/{prior['id']}", json=changed)
                    r.raise_for_status()
                updated += 1
                continue
        skipped += 1

    verb = "would " if args.dry_run else ""
    print(f"Done: {verb}create {created}, update {updated}, skip {skipped}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
