"""Reaching down the Area → Program → Project → Task hierarchy.

Each rung stores one link to the rung above it and no copy of the ones further
up: a project knows its program, a task knows whichever single rung it hangs
from. That makes "everything under X" a join rather than a column read, and this
module is where that join lives so the review dashboard, the derived metrics and
the list filters cannot each grow their own version of it.

The single-link rule is what makes these predicates safe to union: a row appears
under exactly one branch, so nothing is counted twice.
"""

from __future__ import annotations

import uuid
from typing import Any

from sqlalchemy import and_, or_, select

from wild_life.models.core import Program, Project
from wild_life.models.tasks import Task


def programs_in_area(area_id: uuid.UUID) -> Any:
    """Subquery: the ids of an area's programs."""
    return select(Program.id).where(Program.area_id == area_id)


def projects_in_area(area_id: uuid.UUID) -> Any:
    """Subquery: the ids of every project in an area, via its programs."""
    return select(Project.id).where(Project.program_id.in_(programs_in_area(area_id)))


def tasks_rooted_at(entity_type: str, entity_id: uuid.UUID) -> Any | None:
    """WHERE clause matching every task at or below a root.

    Returns ``None`` for a root that cannot hold tasks, so callers can treat an
    unsupported root as "no rows" rather than as "all rows".
    """
    # One shape at every altitude: the scope itself, plus the scopes beneath it.
    # A task names its scope once, so "at or below" is a membership test over a
    # set of references rather than a disjunction over three columns — and the
    # branches differ only in which descendants they gather.
    def under(*descendants: Any) -> Any:
        clauses = [
            and_(Task.scope_type == entity_type, Task.scope_id == entity_id),
            *descendants,
        ]
        return or_(*clauses)

    if entity_type == "project":
        return under()
    if entity_type == "program":
        return under(
            and_(
                Task.scope_type == "project",
                Task.scope_id.in_(
                    select(Project.id).where(Project.program_id == entity_id)
                ),
            )
        )
    if entity_type == "area":
        return under(
            and_(
                Task.scope_type == "program",
                Task.scope_id.in_(programs_in_area(entity_id)),
            ),
            and_(
                Task.scope_type == "project",
                Task.scope_id.in_(projects_in_area(entity_id)),
            ),
        )
    return None
