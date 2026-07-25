"""Dump the OpenAPI document.

The spec is the single source of truth for the web client's types: `web` generates
`schema.gen.ts` from the committed `api/openapi.json`, so the TS types cannot drift
from what the routers actually return. Committing the spec also makes a contract
change visible as a reviewable diff rather than an invisible break.

Keys are sorted so regenerating is deterministic — a spec diff means the API
really changed.
"""

import json
from pathlib import Path

from wild_life.main import app

# api/src/wild_life/openapi.py → api/openapi.json
SPEC_PATH = Path(__file__).resolve().parents[2] / "openapi.json"


def render() -> str:
    return json.dumps(app.openapi(), indent=2, sort_keys=True) + "\n"


def main() -> None:
    SPEC_PATH.write_text(render())
    print(f"wrote {SPEC_PATH}")


if __name__ == "__main__":
    main()
