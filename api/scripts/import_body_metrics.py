#!/usr/bin/env python3
"""Import /data/health/body.xlsx — a year of body measurements.

Source:  a spreadsheet holding three unrelated things in one grid: a body-
         measurement log, a short workout log, and a header block of constants.
Target:  the wild-life-api CRUD endpoints (default http://localhost:9005).

What it creates
---------------
- One `MetricGroup`, **Body Measurements**, rooted on the Health area — six
  numbers taken in one sitting with a tape and a scale.
- Five new `Metric`s, plus the `Weight` that already exists.
- One `GroupReading` per dated row that carries a body measurement, and one
  `MetricEntry` per filled cell.
- **Waist / hip ratio** as a *derived* metric, and the sheet's own goal for it as
  an `Outcome` (`< 0.9`).

What it deliberately does not create
------------------------------------
- **BMI, Wa/Ht and Min Eat1.** Height (74 in) and age sit in the header as frozen
  constants, so all three are deterministic functions of a *single* measured
  column — verified across every row: BMI and Wa/Ht are exact rescalings of
  Weight and Belly (relative spread 2e-16), and Min Eat1 is affine in Weight at
  exactly 10 kcal/kg, which is Mifflin-St Jeor with everything but weight held
  still. Their charts would be the Weight and Waist charts with different numbers
  on the axis. Only Wa/Hip divides one measurement by another, so only Wa/Hip is
  a metric.

  The sheet also shows the cost of storing a quotient: on 2021-03-24 it has no
  weight at all, yet carries BMI `0`, Wa/Ht `0` and Min Eat1 `919.57`. A derived
  metric cannot produce that row, because both operands have to exist.
- **The workout log** (columns M–AX). Thirteen exercises × weight/reps/sets, but
  only ~45 values across six dates in May–June 2020, with `^` ditto marks and
  `!!!` among them. Importing it would mean thirty-nine metrics holding one or
  two entries each, permanently, for a three-week experiment.
- **Height.** A real measurement, but a constant one; as a member it would be a
  row that is blank in every column but the first. It is recorded in the group's
  description instead, where anything reading the waist/hip ratio can find it.

Naming
------
The sheet's column names are measurement *sites*; the metrics are named for what
is being measured, with the site kept in `scale`. `Belly`→`Waist` and `Ass`→`Hip`
come from the sheet itself, whose derived column is `Wa/Hip`; `Nipple`→`Chest` is
the same move, and `Bicept`→`Bicep` is a typo. A metric reading "Nipple: 40.25
in" does not say what it measured.

Idempotency
-----------
Metrics, groups and the outcome match by name; readings match by (group, date).
Nothing is created twice, so the script is safe to re-run. `--dry-run` prints the
plan and writes nothing.

Usage
-----
    uv run python scripts/import_body_metrics.py --dry-run
    uv run python scripts/import_body_metrics.py
"""

from __future__ import annotations

import argparse
import os
import subprocess
import sys
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

import httpx
import openpyxl

SHEET = Path("/data/health/body.xlsx")
BASE_URL = os.environ.get("WILD_LIFE_URL", "http://localhost:9005")
HEALTH_AREA = ("area", "e23c1e03-3d53-431d-9034-17211a937c72")

GROUP = "Body Measurements"
HEIGHT_IN = 74

# Column index -> (metric name, unit, how it is read). Index rather than header
# text because the sheet's two header rows are group labels, not a single row of
# names, and the body block is a fixed span.
COLUMNS: list[tuple[int, str, str, str]] = [
    (1, "Waist", "in", "Tape at the belly, relaxed. The sheet's 'Belly' column."),
    (2, "Hip", "in", "Tape at the widest point. The sheet's 'Ass' column."),
    (3, "Chest", "in", "Tape at the nipple line. The sheet's 'Nipple' column."),
    (4, "Bicep", "in", "Tape at the mid upper arm, relaxed."),
    (5, "Thigh", "in", "Tape at the mid thigh."),
    (6, "Weight", "lb", ""),
]

RATIO = ("Waist / hip ratio", "Waist", "Hip")
OUTCOME = ("Waist-to-hip ratio under 0.9", 0.9)


class Api:
    def __init__(self, token: str, dry_run: bool) -> None:
        self.dry = dry_run
        self.http = httpx.Client(
            base_url=BASE_URL,
            headers={"Authorization": f"Bearer {token}"},
            timeout=30.0,
        )
        self._fake = 0

    def get(self, path: str, **params: Any) -> Any:
        r = self.http.get(path, params=params or None)
        r.raise_for_status()
        return r.json()

    def post(self, path: str, body: dict[str, Any]) -> Any:
        if self.dry:
            self._fake += 1
            return {"id": f"dry-{self._fake:04d}", **body}
        r = self.http.post(path, json=body)
        r.raise_for_status()
        return r.json()

    def put(self, path: str, body: dict[str, Any]) -> Any:
        if self.dry:
            return body
        r = self.http.put(path, json=body)
        r.raise_for_status()
        return r.json()


def read_sheet() -> list[tuple[datetime, dict[str, float]]]:
    """One dict per dated row, holding only the body columns that were filled."""
    ws = openpyxl.load_workbook(SHEET, data_only=True)["Measurements"]
    sittings: list[tuple[datetime, dict[str, float]]] = []
    for row in ws.iter_rows(min_row=6, values_only=True):
        when = row[0]
        if not isinstance(when, datetime):
            continue
        values: dict[str, float] = {}
        for i, name, _, _ in COLUMNS:
            cell = row[i] if i < len(row) else None
            if isinstance(cell, (int, float)):
                values[name] = float(cell)
        if values:
            sittings.append((when.replace(tzinfo=timezone.utc), values))
    return sittings


def main() -> int:
    ap = argparse.ArgumentParser(description=__doc__)
    ap.add_argument("--dry-run", action="store_true")
    ap.add_argument("--token")
    args = ap.parse_args()

    token = (
        args.token
        or subprocess.run(
            ["wildpc", "secret", "get", "WILD_LIFE_TOKEN"],
            capture_output=True,
            text=True,
            check=True,
        ).stdout.strip()
    )
    api = Api(token, args.dry_run)

    sittings = read_sheet()
    span = f"{sittings[0][0].date()} … {sittings[-1][0].date()}"
    print(f"sheet: {len(sittings)} sittings, {span}\n")

    metrics_by_name: dict[str, str] = {
        m["name"]: m["id"] for m in api.get("/metrics", limit=500)
    }
    groups_by_name: dict[str, str] = {
        g["name"]: g["id"] for g in api.get("/metric-groups", limit=200)
    }

    def ensure_metric(name: str, **extra: Any) -> str:
        if name in metrics_by_name:
            print(f"  = metric  {name}  (already exists)")
            return metrics_by_name[name]
        made = api.post(
            "/metrics",
            {
                "name": name,
                "entity_type": HEALTH_AREA[0],
                "entity_id": HEALTH_AREA[1],
                **extra,
            },
        )
        metrics_by_name[name] = made["id"]
        print(
            f"  + metric  {name}"
            + (f"  ({extra['unit']})" if extra.get("unit") else "")
        )
        return made["id"]

    members = [
        ensure_metric(name, unit=unit, **({"scale": scale} if scale else {}))
        for _, name, unit, scale in COLUMNS
    ]

    if GROUP not in groups_by_name:
        made = api.post(
            "/metric-groups",
            {
                "name": GROUP,
                "entity_type": HEALTH_AREA[0],
                "entity_id": HEALTH_AREA[1],
                "description": (
                    "Tape and scale, taken in one sitting. Height is "
                    f"{HEIGHT_IN} in and does not vary, so it is not a member — "
                    "it is here because the waist/hip reading is read against it."
                ),
            },
        )
        groups_by_name[GROUP] = made["id"]
        print(f"\n+ group  {GROUP}  ({len(members)} members)")
    gid = groups_by_name[GROUP]

    # Membership second: `get_session` commits in the dependency teardown, after
    # the endpoint has returned, so a POST followed immediately by a write against
    # the row it just made can outrun the commit.
    api.put(f"/metric-groups/{gid}/members", {"metric_ids": members})

    # The ratio last — its operands must exist first.
    print()
    name, num, den = RATIO
    ratio_id = ensure_metric(
        name,
        source="derived",
        derivation="ratio",
        numerator_metric_id=metrics_by_name[num],
        denominator_metric_id=metrics_by_name[den],
    )

    statement, target_max = OUTCOME
    existing_outcomes = api.get("/outcomes", limit=200)
    if not any(o["statement"] == statement for o in existing_outcomes):
        api.post(
            "/outcomes",
            {
                "statement": statement,
                "kind": "standard",
                "entity_type": HEALTH_AREA[0],
                "entity_id": HEALTH_AREA[1],
                "metric_id": ratio_id,
                "target_max": target_max,
                "description": "The goal band written at the top of body.xlsx.",
            },
        )
        print(f"  + outcome {statement}")

    # Readings. One per dated row, carrying every filled cell of that row.
    print()
    existing_at = {
        r["recorded_at"][:10]
        for r in (api.get(f"/metric-groups/{gid}/readings") if not api.dry else [])
    }
    written = skipped = values_written = 0
    for when, values in sittings:
        if when.date().isoformat() in existing_at:
            skipped += 1
            continue
        api.post(
            f"/metric-groups/{gid}/readings",
            {
                "recorded_at": when.isoformat(),
                "values": [
                    {"metric_id": metrics_by_name[n], "value": v}
                    for n, v in values.items()
                ],
            },
        )
        written += 1
        values_written += len(values)
        print(f"  + {when.date()}  {len(values)} values  " + ", ".join(sorted(values)))

    print(
        f"\n{'DRY RUN — ' if api.dry else ''}"
        f"{written} readings, {values_written} values"
        + (f", {skipped} already present" if skipped else "")
    )
    print(
        "\nNot imported, by design: BMI, Wa/Ht and Min Eat1 (each a function of "
        "one measured column, since height and age are frozen), and the "
        "May–June 2020 workout log."
    )
    return 0


if __name__ == "__main__":
    sys.exit(main())
