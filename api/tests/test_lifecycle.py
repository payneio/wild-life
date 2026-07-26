"""Unit tests for the canonical lifecycle-phase mapping (no DB)."""

import json
from typing import Any, get_args

import pytest

from wild_life.lifecycle import (
    LIFECYCLE,
    closed_statuses,
    is_open,
    phase_of,
    render,
)
from wild_life.schemas.common import (
    AreaStatus,
    CommitmentStatus,
    DelegationStatus,
    GoalStatus,
    ProgramStatus,
    ProjectStatus,
    RequestStatus,
    RoutineStatus,
    TaskStatus,
)
from wild_life.schemas.health import AllergyStatus, ConditionStatus, PlanStatus
from wild_life.schemas.organizations import OrgStatus

# Every entity whose status vocabulary the table must classify. Adding a
# status-bearing entity means adding it here — the parity test below then makes
# leaving it unclassified impossible.
STATUS_UNIONS: dict[str, Any] = {
    "task": TaskStatus,
    "project": ProjectStatus,
    "program": ProgramStatus,
    "goal": GoalStatus,
    "request": RequestStatus,
    "delegation": DelegationStatus,
    "commitment": CommitmentStatus,
    "area": AreaStatus,
    "routine": RoutineStatus,
    "condition": ConditionStatus,
    "allergy": AllergyStatus,
    "insurance_plan": PlanStatus,
    "organization": OrgStatus,
}


def test_phase_mapping() -> None:
    assert phase_of("task", "waiting") == "blocked"
    assert phase_of("task", "completed") == "done"
    assert phase_of("task", "in_progress") == "active"
    assert phase_of("project", "paused") == "blocked"
    assert phase_of("request", "open") == "active"
    assert phase_of("request", "resolved") == "done"
    assert phase_of("task", "bogus") is None
    assert phase_of("unknown_entity", "x") is None
    assert phase_of("task", None) is None


def test_is_open() -> None:
    assert is_open("task", "in_progress")
    assert is_open("task", "waiting")
    assert not is_open("task", "completed")
    assert not is_open("task", "cancelled")
    assert is_open("request", "open")
    assert not is_open("request", "resolved")


@pytest.mark.parametrize("entity_type,union", STATUS_UNIONS.items())
def test_every_status_is_classified(entity_type: str, union: Any) -> None:
    """The omission-impossible guard.

    Equality, not subset: a new status in a `Literal` fails until it is given a
    phase, and a stale entry for a removed status fails too. Without this, an
    unclassified status silently reports "open" and quietly leaks a dead record
    back into every picker.
    """
    assert set(get_args(union)) == set(LIFECYCLE[entity_type])


def test_no_unclassified_entities_in_table() -> None:
    """The table may not classify an entity the test doesn't know about — that
    would mean a status vocabulary drifting with nothing checking it."""
    assert set(LIFECYCLE) == set(STATUS_UNIONS)


def test_closed_statuses() -> None:
    assert closed_statuses("task") == {"completed", "cancelled"}
    # `archived` is closed for a project but only `done`-by-phase, not cancelled.
    assert closed_statuses("project") == {"completed", "cancelled", "archived"}
    # Dormant is not closed — you still file work under an inactive area/org.
    assert closed_statuses("area") == {"archived"}
    assert closed_statuses("organization") == {"archived"}
    assert closed_statuses("unknown_entity") == set()


def test_tasks_router_derives_closed_statuses() -> None:
    """`routers/tasks.py` restated this set once and drifted from the table. It
    must stay derived, so `include_closed` and the picker filter can't disagree."""
    from wild_life.routers import tasks

    assert tasks._CLOSED_STATUSES == closed_statuses("task")


def test_render_is_deterministic_json() -> None:
    """The web app compiles this into `lifecycle.gen.ts`; it must be stable."""
    assert json.loads(render()) == LIFECYCLE
    assert render() == render()
