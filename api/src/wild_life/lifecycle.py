"""Canonical lifecycle phases — one uniform notion of "state of work".

Each entity keeps its own status vocabulary; this projects them all onto a shared
set of phases (backlog / active / blocked / done / cancelled) so cross-entity
reasoning and drift detection can treat "is this open?" uniformly. We detect and
surface inconsistency (see the review-dashboard) rather than hard-enforcing it.
"""

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
        "paused": "blocked",
        "completed": "done",
        "cancelled": "cancelled",
    },
    "goal": {
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
}

_CLOSED_PHASES = {"done", "cancelled"}


def phase_of(entity_type: str, status: str | None) -> LifecyclePhase | None:
    """The canonical phase for an entity's status, or None if unknown."""
    if status is None:
        return None
    return LIFECYCLE.get(entity_type, {}).get(status)


def is_open(entity_type: str, status: str | None) -> bool:
    """True unless the entity is in a terminal (done/cancelled) phase."""
    return phase_of(entity_type, status) not in _CLOSED_PHASES
