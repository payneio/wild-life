"""Canonical lifecycle phases — one uniform notion of "state of work".

Each entity keeps its own status vocabulary; this projects them all onto a shared
set of phases (backlog / active / blocked / done / cancelled) so cross-entity
reasoning can treat "is this open?" uniformly.

This table is the single authority on what "closed" means. Its consumers:
  - ``routers/tasks.py`` — the ``include_closed`` query param.
  - the web app — exported to ``api/lifecycle.json`` by ``wild-life-lifecycle``
    and compiled into ``web/src/services/api/lifecycle.gen.ts`` by ``pnpm gen:api``,
    where it decides which rows an entity picker may offer.
Add a status to a ``Literal`` in ``schemas/`` and you must classify it here;
``tests/test_lifecycle.py`` fails until you do.
"""

import json
from pathlib import Path

from wild_life.schemas.common import LifecyclePhase

# entity_type -> {status: phase}
LIFECYCLE: dict[str, dict[str, LifecyclePhase]] = {
    "task": {
        "inbox": "backlog",
        "planned": "backlog",
        "in_progress": "active",
        "waiting": "blocked",
        "delegated": "active",
        "delivered": "active",
        "completed": "done",
        "cancelled": "cancelled",
    },
    "project": {
        "proposed": "backlog",
        "active": "active",
        "waiting": "blocked",
        "paused": "blocked",
        "completed": "done",
        "cancelled": "cancelled",
        "archived": "done",
    },
    "program": {
        "proposed": "backlog",
        "active": "active",
        # Watched rather than pushed on — a condition you carry is still live.
        "monitoring": "active",
        "paused": "blocked",
        "resolved": "done",
        "cancelled": "cancelled",
    },
    "outcome": {
        "active": "active",
        "achieved": "done",
        "paused": "blocked",
        "dropped": "cancelled",
    },
    "request": {
        "open": "active",
        "resolved": "done",
        "cancelled": "cancelled",
    },
    "delegation": {
        "draft": "backlog",
        "requested": "active",
        "accepted": "active",
        "in_progress": "active",
        "waiting_for_update": "blocked",
        "blocked": "blocked",
        "delivered": "active",
        "revision_requested": "active",
        "accepted_as_complete": "done",
        "declined": "cancelled",
        "reassigned": "cancelled",
        "cancelled": "cancelled",
    },
    "commitment": {
        "open": "active",
        "in_progress": "active",
        "waiting": "blocked",
        "fulfilled": "done",
        "broken": "cancelled",
        "cancelled": "cancelled",
    },
    "area": {
        "active": "active",
        # Dormant, not dead — you still file work under a quiet area.
        "inactive": "blocked",
        "archived": "done",
    },
    "routine": {
        "active": "active",
        "paused": "blocked",
        "archived": "done",
    },
    "allergy": {
        "active": "active",
        "suspected": "active",
        "resolved": "done",
    },
    "insurance_plan": {
        "active": "active",
        # A lapsed plan should never be assignable to new claims/providers.
        "inactive": "done",
    },
    "organization": {
        "active": "active",
        "inactive": "blocked",
        "archived": "done",
    },
}

_CLOSED_PHASES = {"done", "cancelled"}


def phase_of(entity_type: str, status: str | None) -> LifecyclePhase | None:
    """The canonical phase for an entity's status, or None if unknown."""
    if status is None:
        return None
    return LIFECYCLE.get(entity_type, {}).get(status)


def is_open(entity_type: str, status: str | None) -> bool:
    """True unless the entity is in a terminal (done/cancelled) phase.

    Status-only: lifecycle facts stored as timestamps rather than a status value
    (``Event.cancelled_at``, ``Review.completed_at``, ``Area.archived_at``) are
    invisible here, as are types with no status column at all. Both cases report
    open, which is what callers filtering a picker want — absence of a terminal
    status is not evidence of one.
    """
    return phase_of(entity_type, status) not in _CLOSED_PHASES


def closed_statuses(entity_type: str) -> set[str]:
    """The statuses of ``entity_type`` that sit in a terminal phase.

    The set form the query layer wants (``status.notin_(...)``); derived so a
    router can never drift from the table the way ``tasks.py`` once did.
    """
    return {s for s, p in LIFECYCLE.get(entity_type, {}).items() if p in _CLOSED_PHASES}


# api/src/wild_life/lifecycle.py → api/lifecycle.json
TABLE_PATH = Path(__file__).resolve().parents[2] / "lifecycle.json"


def render() -> str:
    """The table as JSON. Sorted so regenerating is deterministic — a diff here
    means the lifecycle really changed."""
    return json.dumps(LIFECYCLE, indent=2, sort_keys=True) + "\n"


def main() -> None:
    TABLE_PATH.write_text(render())
    print(f"wrote {TABLE_PATH}")


if __name__ == "__main__":
    main()
