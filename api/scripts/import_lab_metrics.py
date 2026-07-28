#!/usr/bin/env python3
"""Import /data/health/metrics.xlsx — fifteen years of lab results.

Source:  a spreadsheet whose shape *is* the model: one row per draw, one column
         per analyte, columns grouped under panel headers.
Target:  the wild-life-api CRUD endpoints (default http://localhost:9005).

What it creates
---------------
- One `MetricGroup` per panel header in the sheet, rooted on the program or area
  it measures.
- One `Metric` per analyte column, reusing the seven that already exist rather
  than duplicating them.
- One `GroupReading` per dated row, and one `MetricEntry` per filled cell — all
  the values of a draw sharing a single `recorded_at`, because they *are* one
  act.

What it deliberately does not create
------------------------------------
- **The five ratio columns** (`CHOL/HDL`, `LDL/HDL`, `TRI/HDL`, `BUN/Creatinie`,
  `Iron Sat`). Each is exactly computable from two other columns — verified
  against all 32 stored values — so they become *derived* metrics that pair by
  occasion. The sheet shows why that matters: on 2023-05-24 it carries no
  triglycerides at all and a stored `TRI/HDL` of 120, which with HDL at 44 would
  mean triglycerides of 5,280.
- **Reference ranges.** The sheet has none, and they are lab- and
  patient-specific. An invented normal band is worse than an empty one.
- **The two qualitative results** (`HCV Ab` "Non reactive", urine nicotine
  "NEG"). `MetricEntry.value` is a float; bending the column for two cells is
  the wrong trade, so they go into a note rooted at Health.

Units are assigned from the analyte, not the file — the sheet has no units row.
Every assignment was checked against the observed magnitudes (HGB 14.7–15.7 g/dL,
WBC 6.1–7.7 ×10³/µL, A1c 5.2–5.4 %), which match the standard units throughout.

Idempotency
-----------
Metrics and groups match by name; readings match by (group, recorded_at). Nothing
is created twice, so the script is safe to re-run. `--dry-run` prints the plan
and writes nothing.

Usage
-----
    uv run python scripts/import_lab_metrics.py --dry-run
    uv run python scripts/import_lab_metrics.py
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

SHEET = Path("/data/health/metrics.xlsx")
BASE_URL = os.environ.get("WILD_LIFE_URL", "http://localhost:9005")

# Where each group is rooted. The lipid metrics join the three that already sit
# on Hyperlipidemia; everything else measures Health generally.
HEALTH_AREA = ("area", "e23c1e03-3d53-431d-9034-17211a937c72")
HYPERLIPIDEMIA = ("program", "4748beb2-a360-4daa-af26-e3a3c292837b")
GROUP_ROOTS: dict[str, tuple[str, str]] = {"Lipid Panel": HYPERLIPIDEMIA}

# Columns that already exist as metrics — reused by name rather than duplicated.
EXISTING: dict[str, str] = {
    "Weight": "Weight",
    "CHOL": "Total cholesterol",
    "LDL": "LDL cholesterol",
    "TRI": "Triglycerides",
    "PSA": "PSA",
}

# "130/80" is one column and two metrics; the app already has both.
BP_SPLIT = ("Blood Pressure: Systolic", "Blood Pressure: Diastolic")

# Ratios: (metric name, numerator column, denominator column, derivation).
# Never imported as readings — they compute themselves, per occasion.
RATIOS: list[tuple[str, str, str, str]] = [
    ("Cholesterol / HDL", "CHOL", "HDL", "ratio"),
    ("LDL / HDL", "LDL", "HDL", "ratio"),
    ("Triglycerides / HDL", "TRI", "HDL", "ratio"),
    ("BUN / Creatinine", "BUN", "Creatinine", "ratio"),
    ("Iron saturation", "Iron", "TIBC", "percent"),
]
RATIO_COLUMNS = {"CHOL/HDL", "LDL/HDL", "TRI/HDL", "BUN/Creatinie", "Iron Sat"}

# Columns whose results are words, not numbers.
QUALITATIVE = {"HCV Ab", "URN NICOTINE METABOLITES"}

# Typos normalised on the way in. Deliberately *not* here: `EGFR -B` and
# `EGFR B`, which look like two spellings of one column but carry different
# values on the same 2014 draw (107 and 130) — a lab reporting eGFR under two
# formulas. Merging them would put two values on one metric in one reading.
# They import as two metrics under the sheet's own names; rename them by hand
# from the report rather than having a script guess at clinical meaning.
RENAME: dict[str, str] = {
    "Biliruben, Direct": "Bilirubin, Direct",
    "ALT (SPGT)": "ALT (SGPT)",
    "L Cirumflex": "Left circumflex",
}

UNITS: dict[str, str] = {
    "Weight": "lb",
    "CHOL": "mg/dL",
    "HDL": "mg/dL",
    "LDL": "mg/dL",
    "VLDL": "mg/dL",
    "TRI": "mg/dL",
    "Protein": "g/dL",
    "Albumin": "g/dL",
    "Globulin": "g/dL",
    "Bilirubin, Total": "mg/dL",
    "Bilirubin, Direct": "mg/dL",
    "ALK PTASE": "U/L",
    "AST (SGOT)": "U/L",
    "ALT (SGPT)": "U/L",
    "Gamma Glutamyltransferase": "U/L",
    "EGFR -B": "mL/min/1.73m²",
    "EGFR B": "mL/min/1.73m²",
    "eGFR": "mL/min/1.73m²",
    "B12": "pg/mL",
    "Folate": "ng/mL",
    "TSH": "µIU/mL",
    "T4,Free": "ng/dL",
    "Glucose": "mg/dL",
    "Fructosamine": "mmol/L",
    "BUN": "mg/dL",
    "Creatinine": "mg/dL",
    "Uric Acid": "mg/dL",
    "Anion Gap": "mmol/L",
    "Sodium": "mmol/L",
    "Potassium": "mmol/L",
    "Chloride": "mmol/L",
    "CO2": "mmol/L",
    "Calcium": "mg/dL",
    "LDH": "U/L",
    "WBC": "10³/µL",
    "RBC": "10⁶/µL",
    "HGB": "g/dL",
    "HCT": "%",
    "MCV": "fL",
    "MCH": "pg",
    "MCHC": "g/dL",
    "RDW": "%",
    "Platelets": "10³/µL",
    "TIBC": "µg/dL",
    "UIBC": "µg/dL",
    "Iron": "µg/dL",
    "A1c": "%",
    "PSA": "ng/mL",
    "Ferritin": "ng/mL",
    "URN CREATININE": "mg/dL",
    "URN GLUCOSE": "mg/dL",
    "URN PROTEIN": "mg/dL",
    "URN RBC": "/hpf",
    "URN WBC": "/hpf",
    "URN HYALINE CASTS": "/lpf",
    "URN GRANULAR CASTS": "/lpf",
    "Calcium score": "Agatston",
    "LMA": "Agatston",
    "LAD": "Agatston",
    "Left circumflex": "Agatston",
    "RCA": "Agatston",
}


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


def read_sheet() -> tuple[dict[str, list[str]], list[tuple[datetime, dict[str, Any]]]]:
    """The sheet's own structure: panel -> columns, and one dict per dated draw."""
    ws = openpyxl.load_workbook(SHEET, data_only=True)["Sheet1"]
    rows = list(ws.iter_rows(values_only=True))
    panels, names = rows[0], rows[1]

    groups: dict[str, list[str]] = {}
    col_of: dict[str, int] = {}
    current = None
    for i, raw in enumerate(names):
        if panels[i]:
            current = str(panels[i])
        if not raw or i == 0:
            continue
        name = RENAME.get(str(raw), str(raw))
        col_of[name] = i
        bucket = groups.setdefault(current or "Vitals", [])
        if name not in bucket:  # a column name appears once per group
            bucket.append(name)

    draws: list[tuple[datetime, dict[str, Any]]] = []
    for r in rows[2:]:
        if not r[0]:
            continue
        when = r[0]
        if not isinstance(when, datetime):
            continue
        values = {name: r[i] for name, i in col_of.items() if r[i] not in (None, "")}
        draws.append((when.replace(tzinfo=timezone.utc), values))
    return groups, draws


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

    groups, draws = read_sheet()
    print(f"sheet: {len(groups)} groups, {len(draws)} draws\n")

    metrics_by_name: dict[str, str] = {
        m["name"]: m["id"] for m in api.get("/metrics", limit=500)
    }
    groups_by_name: dict[str, str] = {
        g["name"]: g["id"] for g in api.get("/metric-groups", limit=200)
    }

    def ensure_metric(name: str, root: tuple[str, str], **extra: Any) -> str:
        if name in metrics_by_name:
            return metrics_by_name[name]
        body = {
            "name": name,
            "entity_type": root[0],
            "entity_id": root[1],
            "unit": UNITS.get(name),
            **extra,
        }
        made = api.post("/metrics", body)
        metrics_by_name[name] = made["id"]
        print(
            f"  + metric  {name}" + (f"  ({body['unit']})" if body.get("unit") else "")
        )
        return made["id"]

    # Metrics and groups first; membership second. `get_session` commits in the
    # dependency teardown — after the endpoint has returned — so a POST followed
    # immediately by a write against the row it just made can outrun the commit.
    # Two passes sidesteps that by construction rather than by retrying.
    created_groups = 0
    members_of: dict[str, list[str]] = {}
    for panel, columns in groups.items():
        root = GROUP_ROOTS.get(panel, HEALTH_AREA)
        members: list[str] = []
        for col in columns:
            if col in RATIO_COLUMNS or col in QUALITATIVE:
                continue
            if col == "BP":
                members += [ensure_metric(n, root) for n in BP_SPLIT]
                continue
            members.append(ensure_metric(EXISTING.get(col, col), root))
        members_of[panel] = members

        if panel not in groups_by_name:
            made = api.post(
                "/metric-groups",
                {"name": panel, "entity_type": root[0], "entity_id": root[1]},
            )
            groups_by_name[panel] = made["id"]
            created_groups += 1
            print(f"+ group  {panel}  ({len(members)} members)")

    for panel, members in members_of.items():
        api.put(
            f"/metric-groups/{groups_by_name[panel]}/members",
            {"metric_ids": members},
        )

    # Ratios last: their operands must exist first.
    print()
    for name, num_col, den_col, kind in RATIOS:
        num = metrics_by_name.get(EXISTING.get(num_col, num_col))
        den = metrics_by_name.get(EXISTING.get(den_col, den_col))
        if not (num and den):
            print(f"  ! skipping {name} — operand missing")
            continue
        ensure_metric(
            name,
            GROUP_ROOTS.get("Lipid Panel", HEALTH_AREA)
            if "HDL" in num_col + den_col
            else HEALTH_AREA,
            source="derived",
            derivation=kind,
            numerator_metric_id=num,
            denominator_metric_id=den,
        )

    # Readings. One per dated row, carrying every filled cell of that row.
    print()
    written = skipped = values_written = 0
    for panel, columns in groups.items():
        gid = groups_by_name[panel]
        existing_at = {
            r["recorded_at"][:10]
            for r in (api.get(f"/metric-groups/{gid}/readings") if not api.dry else [])
        }
        for when, values in draws:
            present = {c: v for c, v in values.items() if c in columns}
            payload: list[dict[str, Any]] = []
            for col, raw in present.items():
                if col in RATIO_COLUMNS or col in QUALITATIVE:
                    continue
                if col == "BP" and isinstance(raw, str) and "/" in raw:
                    sys_, dia = raw.split("/", 1)
                    payload += [
                        {
                            "metric_id": metrics_by_name[BP_SPLIT[0]],
                            "value": float(sys_),
                        },
                        {
                            "metric_id": metrics_by_name[BP_SPLIT[1]],
                            "value": float(dia),
                        },
                    ]
                    continue
                if not isinstance(raw, (int, float)):
                    continue
                payload.append(
                    {
                        "metric_id": metrics_by_name[EXISTING.get(col, col)],
                        "value": float(raw),
                    }
                )
            if not payload:
                continue
            if when.date().isoformat() in existing_at:
                skipped += 1
                continue
            api.post(
                f"/metric-groups/{gid}/readings",
                {"recorded_at": when.isoformat(), "values": payload},
            )
            written += 1
            values_written += len(payload)
            print(f"  + {panel:24} {when.date()}  {len(payload)} values")

    print(
        f"\n{'DRY RUN — ' if api.dry else ''}"
        f"{created_groups} groups, {written} readings, {values_written} values"
        + (f", {skipped} already present" if skipped else "")
    )
    # The two results that are words rather than numbers. A note keeps them
    # findable without giving `MetricEntry.value` a meaning it doesn't have.
    qualitative: list[str] = []
    for when, values in draws:
        for col in QUALITATIVE:
            if col in values:
                qualitative.append(f"- **{col}** — {values[col]} ({when.date()})")
    if qualitative:
        title = "Lab results recorded as words"
        existing = api.get("/notes", entity_type="area", entity_id=HEALTH_AREA[1])
        if not any(n.get("title") == title for n in (existing if not api.dry else [])):
            api.post(
                "/notes",
                {
                    "title": title,
                    "body": (
                        "Results from the imported lab spreadsheet that are not "
                        "numbers, so they are not metric readings:\n\n"
                        + "\n".join(qualitative)
                    ),
                    "entry_date": max(w for w, _ in draws).date().isoformat(),
                    "entity_type": HEALTH_AREA[0],
                    "entity_id": HEALTH_AREA[1],
                },
            )
            print(f"\n+ note   {title}  ({len(qualitative)} results)")

    print(
        "\nNot imported as readings, by design: 5 ratio columns — they are "
        "derived metrics and compute themselves, per occasion."
    )
    return 0


if __name__ == "__main__":
    sys.exit(main())
