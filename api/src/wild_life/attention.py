"""Attention: cadence, examination, and what counts as neglect.

The third category in `docs/domain.md`, and the one neither literature this model
draws on supplies whole. A scope is a bounded amount of regard you allocate; it
does not get discharged like a commitment, it gets *examined*, and it fails by
not being.

Two axioms live here.

**A10 — cadence inherits, examination does not.** A cadence declared anywhere
applies to everything beneath it unless overridden, so a hierarchy does not need
a declaration per node: 21 of 24 programs declare none and inherit their area's.
Examination stays explicit and names the scopes it covered, because looking at a
program is not automatically looking at each of its projects — that is the whole
point of having altitudes.

**A1 — a scope unexamined past its cadence is a failure of attention**, at every
altitude. This replaced a predicate that measured something else entirely: the
old "neglected areas" listed areas with no open projects or tasks, which is
*inactivity*. An area humming with work you have not looked at in three months is
the neglect that matters, and it was the one case the old rule could not report.
"""

from __future__ import annotations

import uuid
from datetime import date, timedelta

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from wild_life.models.core import Area, Program, Project
from wild_life.models.reviews import Review

#: How long a cadence allows between examinations. Absent from this map means
#: "no expectation", which is different from a long one — nothing can be overdue
#: against a cadence nobody set anywhere up the tree.
CADENCE_DAYS: dict[str, int] = {
    "daily": 1,
    "weekly": 7,
    "biweekly": 14,
    "monthly": 31,
    "quarterly": 92,
    "annually": 366,
}


def scope_ref(entity_type: str, entity_id: uuid.UUID) -> str:
    """How a review names a scope it examined.

    The same `type:id` form the moment links use, so one convention covers every
    soft reference in the system rather than each surface inventing its own.
    """
    return f"{entity_type}:{entity_id}"


class Attention:
    """The attention hierarchy, resolved once so callers can ask about it.

    Loaded eagerly rather than queried per scope: there are tens of these, the
    cadence resolution walks upward, and a dashboard asking about every scope
    would otherwise issue a query per rung per node.
    """

    def __init__(
        self,
        areas: list[Area],
        programs: list[Program],
        projects: list[Project],
        examined: dict[str, date],
    ) -> None:
        self.areas = areas
        self.programs = programs
        self.projects = projects
        self._examined = examined
        self._parent: dict[str, str | None] = {}
        self._own: dict[str, str | None] = {}
        # When the scope came into existence. A scope that has never been
        # examined is due one cadence after it *existed*, not one cadence ago —
        # otherwise everything created today is instantly overdue, which reports
        # a failure nobody could have avoided.
        self._born: dict[str, date] = {}
        for a in areas:
            self._parent[scope_ref("area", a.id)] = None
            born = getattr(a, "created_at", None)
            if born is not None:
                self._born[scope_ref("area", a.id)] = born.date()
            self._own[scope_ref("area", a.id)] = a.review_frequency
        for p in programs:
            self._parent[scope_ref("program", p.id)] = (
                scope_ref("area", p.area_id) if p.area_id else None
            )
            born = getattr(p, "created_at", None)
            if born is not None:
                self._born[scope_ref("program", p.id)] = born.date()
            self._own[scope_ref("program", p.id)] = p.review_frequency
        for pr in projects:
            self._parent[scope_ref("project", pr.id)] = (
                scope_ref("program", pr.program_id) if pr.program_id else None
            )
            born = getattr(pr, "created_at", None)
            if born is not None:
                self._born[scope_ref("project", pr.id)] = born.date()
            self._own[scope_ref("project", pr.id)] = getattr(
                pr, "review_frequency", None
            )

    @staticmethod
    def examined_from(reviews: list) -> dict[str, date]:  # noqa: ANN001
        """The latest examination date per scope.

        Only *completed* reviews examine anything. An open review is an intention
        to look, and counting it would let scheduling a review discharge the
        obligation the review was scheduled to meet.
        """
        examined: dict[str, date] = {}
        for r in reviews:
            if r.completed_at is None:
                continue
            when = r.completed_at.date()
            for ref in r.entities_reviewed or []:
                if ref not in examined or examined[ref] < when:
                    examined[ref] = when
        return examined

    @classmethod
    async def load(cls, session: AsyncSession) -> Attention:
        areas = list((await session.execute(select(Area))).scalars().all())
        programs = list((await session.execute(select(Program))).scalars().all())
        projects = list((await session.execute(select(Project))).scalars().all())

        rows = list((await session.execute(select(Review))).scalars().all())
        return cls(areas, programs, projects, cls.examined_from(rows))

    def cadence(self, ref: str) -> str | None:
        """The effective cadence: this scope's, or the nearest ancestor's.

        Walks upward rather than pushing downward on write, so changing an area's
        cadence takes effect for everything under it without a rewrite — and a
        scope that later declares its own simply stops inheriting.
        """
        seen: set[str] = set()
        cur: str | None = ref
        while cur is not None and cur not in seen:
            seen.add(cur)
            own = self._own.get(cur)
            if own:
                return own
            cur = self._parent.get(cur)
        return None

    def last_examined(self, ref: str) -> date | None:
        return self._examined.get(ref)

    def overdue_by(self, ref: str, today: date) -> int | None:
        """Days past due for examination, or None if not overdue.

        Never examined is due one cadence after the scope existed, not one
        cadence ago: a scope created yesterday under a monthly cadence is not a
        month overdue, and reporting it as one is a failure nobody could have
        avoided. With no creation date to reckon from, it is due now.
        """
        cadence = self.cadence(ref)
        days = CADENCE_DAYS.get(cadence or "")
        if not days:
            return None
        anchor = self.last_examined(ref) or self._born.get(ref)
        if anchor is None:
            return 0
        due = anchor + timedelta(days=days)
        return (today - due).days if today > due else None
