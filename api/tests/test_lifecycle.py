"""Unit tests for the canonical lifecycle-phase mapping (no DB)."""

from wild_life.lifecycle import is_open, phase_of


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
