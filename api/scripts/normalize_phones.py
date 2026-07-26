"""One-off: rewrite stored phone numbers into the canonical E.164 form.

The API normalises on write (`wild_life.phone`), so this only exists to bring
rows written before that into line. No schema change — just values. Idempotent
and safe to re-run: a number already canonical is left untouched, and anything
`normalize_phone` won't confidently parse is never rewritten.

    uv run python scripts/normalize_phones.py            # dry run, prints a diff
    uv run python scripts/normalize_phones.py --apply    # write
"""

import argparse
import json

from sqlalchemy import create_engine, text

from wild_life.config import settings
from wild_life.phone import normalize_phone

SCALAR = [("organizations", "phone"), ("insurance_plans", "phone")]


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("--apply", action="store_true", help="write changes")
    args = ap.parse_args()

    engine = create_engine(settings.sync_database_url)
    changed = unchanged = 0

    with engine.begin() as conn:
        for table, col in SCALAR:
            rows = conn.execute(
                text(f"select id, {col} from wild_life.{table} where {col} is not null")
            ).all()
            for row_id, value in rows:
                new = normalize_phone(value)
                if new == value:
                    unchanged += 1
                    continue
                changed += 1
                print(f"{table}.{col} {value!r} -> {new!r}")
                if args.apply:
                    conn.execute(
                        text(f"update wild_life.{table} set {col} = :v where id = :i"),
                        {"v": new, "i": row_id},
                    )

        rows = conn.execute(
            text(
                "select id, phones from wild_life.people "
                "where jsonb_array_length(phones) > 0"
            )
        ).all()
        for row_id, phones in rows:
            new_phones = [
                {**m, "value": normalize_phone(m["value"])}
                if isinstance(m, dict) and isinstance(m.get("value"), str)
                else m
                for m in phones
            ]
            if new_phones == phones:
                unchanged += len(phones)
                continue
            for old, new in zip(phones, new_phones):
                if old != new:
                    changed += 1
                    print(f"people.phones {old['value']!r} -> {new['value']!r}")
                else:
                    unchanged += 1
            if args.apply:
                conn.execute(
                    text("update wild_life.people set phones = :v where id = :i"),
                    {"v": json.dumps(new_phones), "i": row_id},
                )

        if not args.apply:
            conn.rollback()

    verb = "rewrote" if args.apply else "would rewrite"
    print(f"\n{verb} {changed}; {unchanged} already canonical or left alone")


if __name__ == "__main__":
    main()
