"""Routes for reviews + the review dashboard (neglect/drift detection)."""

from datetime import date, timedelta
from typing import Any

from fastapi import APIRouter, Depends
from sqlalchemy import func, or_, select
from sqlalchemy.ext.asyncio import AsyncSession

from wild_life import regimen
from wild_life.attention import CADENCE_DAYS, Attention, scope_ref
from wild_life.db.session import get_session
from wild_life.identity import Identity, current_identity
from wild_life.models.core import Program, Project
from wild_life.models.outcomes import Outcome, OutcomeEvaluation
from wild_life.models.moments import CalendarRecord, Moment, MomentLink
from wild_life.models.health import Medication
from wild_life.models.protocols import Protocol
from wild_life.models.metrics import Metric, MetricEntry
from wild_life.models.requests import Request
from wild_life.models.routines import Routine, RoutineInstance
from wild_life.models.tasks import Task
from wild_life.models.tracking import Delegation
from wild_life.routers.crud import crud_router
from wild_life.spine import record_finish
from wild_life.schemas.reviews import (
    ReviewCreate,
    ReviewDashboard,
    ReviewRead,
    ReviewUpdate,
)
from wild_life.models.reviews import Review

# Trailing window for medication-adherence review.
ADHERENCE_DAYS = 14


# How long a reading stays fresh, per MeasurementFrequency. An exact lookup, not
# a guess: the field is a closed enum, so an unknown value is a bug, not prose.
FREQUENCY_DAYS: dict[str, int] = {
    "daily": 1,
    "weekly": 7,
    "monthly": 30,
    "quarterly": 90,
    "yearly": 365,
}


router = APIRouter()

router.include_router(
    crud_router(
        prefix="/reviews",
        tag="reviews",
        model=Review,
        create_schema=ReviewCreate,
        read_schema=ReviewRead,
        update_schema=ReviewUpdate,
        on_write=lambda s, o: record_finish(s, "review", o),
        spine_entity="review",
        order_by=Review.created_at.desc(),
    )
)

STALE_DAYS = 14

_TASK_OPEN = ("completed", "cancelled")
_DELEGATION_CLOSED = (
    "delivered",
    "accepted_as_complete",
    "declined",
    "reassigned",
    "cancelled",
)

# Distinct path (not /reviews/...) to avoid colliding with /reviews/{item_id}.
dashboard = APIRouter(tags=["reviews"])


async def _rows(session: AsyncSession, stmt: Any) -> list[Any]:
    return list((await session.execute(stmt)).scalars().all())


@dashboard.get(
    "/review-dashboard",
    operation_id="review_dashboard",
    response_model=ReviewDashboard,
)
async def review_dashboard(
    session: AsyncSession = Depends(get_session),
    identity: Identity = Depends(current_identity),
) -> dict:
    """Surface everything a periodic review should catch."""
    today = date.today()
    stale_before = today - timedelta(days=STALE_DAYS)

    def task_row(t: Task) -> dict:
        return {
            "id": str(t.id),
            "title": t.title,
            "status": t.status,
            "priority": t.priority,
            "due_date": t.due_date.isoformat() if t.due_date else None,
            # The one scope it names, at whatever altitude — the reader wants
            # "where does this sit", and the rung is part of the answer.
            "scope_type": t.scope_type,
            "scope_id": str(t.scope_id) if t.scope_id else None,
        }

    def project_row(p: Project) -> dict:
        return {
            "id": str(p.id),
            "name": p.name,
            "status": p.status,
            "next_action": p.next_action,
            "last_activity_date": p.last_activity_date.isoformat()
            if p.last_activity_date
            else None,
            "accountable_owner_id": str(p.accountable_owner_id)
            if p.accountable_owner_id
            else None,
        }

    def deleg_row(d: Delegation) -> dict:
        return {
            "id": str(d.id),
            "requested_outcome": d.requested_outcome,
            "status": d.status,
            "responsible_id": str(d.responsible_id) if d.responsible_id else None,
            "expected_completion_date": d.expected_completion_date.isoformat()
            if d.expected_completion_date
            else None,
            "follow_up_date": d.follow_up_date.isoformat()
            if d.follow_up_date
            else None,
        }

    # Overdue / due-today tasks (personal, open).
    overdue_tasks = await _rows(
        session,
        select(Task).where(
            Task.due_date < today,
            Task.status.notin_(_TASK_OPEN),
        ),
    )
    due_today = await _rows(
        session,
        select(Task).where(Task.due_date == today, Task.status.notin_(_TASK_OPEN)),
    )

    # Stale / blocked-looking projects.
    stale_projects = await _rows(
        session,
        select(Project).where(
            Project.status == "active",
            (Project.last_activity_date.is_(None))
            | (Project.last_activity_date < stale_before),
        ),
    )
    missing_next_action = await _rows(
        session,
        select(Project).where(
            Project.status == "active",
            (Project.next_action.is_(None)) | (func.length(Project.next_action) == 0),
        ),
    )
    unclear_ownership = await _rows(
        session,
        select(Project).where(
            Project.status.in_(("active", "waiting")),
            Project.accountable_owner_id.is_(None),
        ),
    )

    # Programs active but with no active projects.
    active_project_program_ids = {
        pid
        for (pid,) in (
            await session.execute(
                select(Project.program_id).where(
                    Project.status == "active", Project.program_id.isnot(None)
                )
            )
        ).all()
    }
    inactive_programs = [
        {"id": str(p.id), "name": p.name, "status": p.status}
        for p in await _rows(session, select(Program).where(Program.status == "active"))
        if p.id not in active_project_program_ids
    ]

    # Attention failure, not inactivity. This block used to list areas with no
    # open projects or tasks — which is a report about *work*, and the case it
    # could never surface is the one that matters: an area busy with work you
    # have not looked at in three months. A1 says a scope unexamined past its
    # cadence has failed, at every altitude, so all three rungs are asked the
    # same question and the answer says how many days late.
    att = await Attention.load(session)
    unexamined_scopes = [
        {
            "id": str(obj.id),
            "name": obj.name,
            "type": kind,
            "review_frequency": att.cadence(scope_ref(kind, obj.id)),
            "days_overdue": late,
        }
        for kind, rows in (
            ("area", att.areas),
            ("program", att.programs),
            ("project", att.projects),
        )
        for obj in rows
        if (late := att.overdue_by(scope_ref(kind, obj.id), today)) is not None
    ]
    unexamined_scopes.sort(key=lambda r: -r["days_overdue"])

    # A3 and A1 are the same act: looking at a scope is when its standing claims
    # get a truth value. A *standard* is never completed, so what it needs is not
    # a deadline but a prompt — these are the claims whose last judgement is older
    # than the cadence of the scope they hang on, which is exactly the set a
    # review should walk. A metric-bound claim is excluded: the instrument
    # answers for it, and asking a person to re-judge what a number already says
    # is how a review becomes a chore nobody does.
    latest_eval = {
        oid: when
        for oid, when in (
            await session.execute(
                select(
                    OutcomeEvaluation.outcome_id,
                    func.max(OutcomeEvaluation.evaluated_at),
                ).group_by(OutcomeEvaluation.outcome_id)
            )
        ).all()
    }
    all_outcomes = list((await session.execute(select(Outcome))).scalars().all())
    claims_awaiting_evaluation = []
    for o in all_outcomes:
        if o.kind != "standard" or o.metric_id is not None:
            continue
        cadence = att.cadence(scope_ref(o.entity_type, o.entity_id))
        days = CADENCE_DAYS.get(cadence or "")
        if not days:
            continue  # inert — reported separately, not asked about
        last = latest_eval.get(o.id)
        stale = last is None or (today - last.date()).days > days
        if stale:
            claims_awaiting_evaluation.append(
                {
                    "id": str(o.id),
                    "name": o.statement,
                    "type": o.entity_type,
                    "last_evaluated": last.date().isoformat() if last else None,
                    "review_frequency": cadence,
                }
            )

    # A11: a claim with neither a metric nor a review cadence on its scope is
    # inert — nothing in the system can ever change its truth value. Permitted,
    # because a claim you cannot yet measure is still worth capturing, but
    # reported rather than carried silently among claims that mean something.
    inert_objectives = [
        {"id": str(o.id), "name": o.statement, "type": o.entity_type}
        for o in (await session.execute(select(Outcome))).scalars().all()
        if o.metric_id is None
        and att.cadence(scope_ref(o.entity_type, o.entity_id)) is None
    ]

    # Delegation oversight.
    overdue_delegations = await _rows(
        session,
        select(Delegation).where(
            Delegation.expected_completion_date < today,
            Delegation.status.notin_(_DELEGATION_CLOSED),
        ),
    )
    delegation_followups = await _rows(
        session,
        select(Delegation).where(
            Delegation.follow_up_date <= today,
            Delegation.status.notin_(_DELEGATION_CLOSED),
        ),
    )
    unreviewed_deliverables = await _rows(
        session,
        select(Delegation).where(
            Delegation.status == "delivered",
            Delegation.acceptance_required.is_(True),
        ),
    )

    def request_row(r: Request) -> dict:
        return {
            "id": str(r.id),
            "subject": r.subject,
            "kind": r.kind,
            "requester_id": str(r.requester_id) if r.requester_id else None,
            "addressee_id": str(r.addressee_id) if r.addressee_id else None,
            "needed_by": r.needed_by.isoformat() if r.needed_by else None,
            "follow_up_date": r.follow_up_date.isoformat()
            if r.follow_up_date
            else None,
            "status": r.status,
        }

    # The caller's inbox — open Requests addressed to them (needs their input).
    my_inbox: list[Request] = []
    if identity.person_id is not None:
        my_inbox = await _rows(
            session,
            select(Request).where(
                Request.addressee_id == identity.person_id,
                Request.status == "open",
            ),
        )
    # Oversight: every open Request across all inboxes, regardless of role.
    open_requests = await _rows(
        session, select(Request).where(Request.status == "open")
    )
    # Requests (typically deliverables) past their follow-up date.
    request_followups = await _rows(
        session,
        select(Request).where(
            Request.follow_up_date <= today,
            Request.status == "open",
        ),
    )

    # --- cross-status drift (inconsistency reconciliation queue) -----------
    blocked_task_ids = {
        tid
        for (tid,) in (
            await session.execute(
                select(Request.entity_id).where(
                    Request.entity_type == "task",
                    Request.entity_id.isnot(None),
                    Request.status == "open",
                )
            )
        ).all()
    }
    # Tasks marked 'waiting' with no open Request explaining the block.
    waiting_no_blocker = [
        t
        for t in await _rows(session, select(Task).where(Task.status == "waiting"))
        if t.id not in blocked_task_ids
    ]
    # Tasks 'delegated' with nobody on the hook (no assignee/responsible/accountable).
    delegated_no_owner = await _rows(
        session,
        select(Task).where(
            Task.status == "delegated",
            Task.assignee_id.is_(None),
            Task.responsible_id.is_(None),
            Task.accountable_owner_id.is_(None),
        ),
    )
    # Completed projects that still have open tasks under them.
    open_task_project_ids = {
        pid
        for (pid,) in (
            await session.execute(
                select(Task.scope_id).where(
                    Task.status.notin_(_TASK_OPEN), Task.scope_type == "project"
                )
            )
        ).all()
    }
    completed_with_open_tasks = [
        p
        for p in await _rows(
            session, select(Project).where(Project.status == "completed")
        )
        if p.id in open_task_project_ids
    ]

    # --- health / outcomes / metrics neglect + drift ------------------------
    # A live health program with nothing running for it. Conditions are programs
    # now, so this reads "a diagnosis you are carrying with no protocol in flight" —
    # the same signal, expressed against the merged object.
    active_protocol_program_ids = {
        pid
        for (pid,) in (
            await session.execute(
                select(Protocol.program_id).where(
                    Protocol.paused.is_(False),
                    Protocol.program_id.isnot(None),
                    or_(Protocol.start_date.is_(None), Protocol.start_date <= today),
                    or_(Protocol.end_date.is_(None), Protocol.end_date >= today),
                )
            )
        ).all()
    }
    conditions_without_protocol = [
        {"id": str(p.id), "name": p.name, "status": p.status}
        for p in await _rows(
            session,
            select(Program).where(
                Program.category.isnot(None),
                Program.status.in_(("active", "monitoring")),
            ),
        )
        if p.id not in active_protocol_program_ids
    ]

    # Metrics overdue for a reading (measurement_frequency vs latest entry).
    metrics_overdue = []
    for m in await _rows(
        session,
        select(Metric).where(
            Metric.measurement_frequency.isnot(None),
            # A derived metric reads itself; there is nobody to nag.
            Metric.source == "manual",
        ),
    ):
        interval = FREQUENCY_DAYS.get(m.measurement_frequency or "")
        if interval is None:
            continue
        latest = await session.scalar(
            select(func.max(MetricEntry.recorded_at)).where(
                MetricEntry.metric_id == m.id
            )
        )
        # `recorded_at` comes back in UTC; `today` is local. Compare like for
        # like, or an evening reading reads as next-day and stays "fresh" a day
        # too long.
        latest_day = latest.astimezone().date() if latest else None
        if latest_day is None or latest_day < today - timedelta(days=interval):
            metrics_overdue.append(
                {
                    "id": str(m.id),
                    "name": m.name,
                    "measurement_frequency": m.measurement_frequency,
                    "latest_entry": latest.isoformat() if latest else None,
                }
            )

    # Targets past their date without having been achieved. Standards have no
    # date to be past, and a deliverable's date lives on the work, not the claim.
    outcomes_overdue = [
        {
            "id": str(o.id),
            "name": o.statement,
            "status": o.status,
            "target_date": o.by_when.isoformat() if o.by_when else None,
        }
        for o in await _rows(
            session,
            select(Outcome).where(
                Outcome.kind == "target",
                Outcome.by_when < today,
                Outcome.status != "achieved",
            ),
        )
    ]

    # Low medication adherence over the trailing window (done vs expected doses).
    adh_start = today - timedelta(days=ADHERENCE_DAYS)
    low_adherence = []
    for r in await _rows(
        session,
        select(Routine).where(Routine.medication_id.isnot(None)),
    ):
        med = await session.get(Medication, r.medication_id)
        proto = await session.get(Protocol, r.protocol_id)
        # Only judge adherence for a med whose protocol is currently live.
        if med is None or proto is None or proto.paused:
            continue
        if not (
            (proto.start_date is None or proto.start_date <= today)
            and (proto.end_date is None or proto.end_date >= today)
        ):
            continue
        anchor = proto.start_date or r.created_at.date()
        expected = regimen.expected_days(r, anchor, max(adh_start, anchor), today)
        if expected < 4:
            continue
        done = (
            await session.scalar(
                select(func.count(func.distinct(RoutineInstance.scheduled_date))).where(
                    RoutineInstance.routine_id == r.id,
                    RoutineInstance.status == "done",
                    RoutineInstance.scheduled_date >= adh_start,
                    RoutineInstance.scheduled_date <= today,
                )
            )
        ) or 0
        if done < expected * 0.6:
            low_adherence.append(
                {
                    "id": str(r.id),
                    "medication_id": str(r.medication_id),
                    "label": med.name,
                    "done": int(done),
                    "expected": expected,
                }
            )

    # Inbox: captured without saying what it is. A `capture` is a moment whose
    # kind the creating surface could not resolve, which is the whole definition
    # — positive, rather than "a note with no root". Defining it by absence is
    # what once counted 253 reflections as a backlog, because writing turned
    # inward has no subject to be filed under. Events exclude externally-synced
    # meetings (external_ref), which are noise here.
    #
    # Keep in lockstep with `InboxPage.tsx`: two expressions of one definition,
    # bound only by `tests/test_moments.py`.
    unresolved_captures_count = (
        await session.execute(
            select(func.count()).select_from(Moment).where(Moment.kind == "capture")
        )
    ).scalar_one()
    # Occasions nobody has said what they concern. Synced ones are excluded the
    # way they always were — a meeting someone else's calendar sent you is not a
    # backlog — and "synced" is now "has a projection carrying a foreign UID",
    # which is a fact about sharing rather than a column.
    has_subject = select(MomentLink.moment_id).where(
        MomentLink.moment_id == Moment.id, MomentLink.role == "subject"
    )
    shared = select(CalendarRecord.moment_id).where(
        CalendarRecord.moment_id == Moment.id,
        CalendarRecord.external_ref.isnot(None),
    )
    unrooted_events_count = (
        await session.execute(
            select(func.count())
            .select_from(Moment)
            .where(
                Moment.kind == "occasion",
                ~has_subject.exists(),
                ~shared.exists(),
            )
        )
    ).scalar_one()

    return {
        "generated_for": today.isoformat(),
        "unresolved_captures_count": unresolved_captures_count,
        "unrooted_events_count": unrooted_events_count,
        "conditions_without_protocol": conditions_without_protocol,
        "metrics_overdue": metrics_overdue,
        "outcomes_overdue": outcomes_overdue,
        "low_adherence": low_adherence,
        "overdue_tasks": [task_row(t) for t in overdue_tasks],
        "due_today": [task_row(t) for t in due_today],
        "stale_projects": [project_row(p) for p in stale_projects],
        "projects_missing_next_action": [project_row(p) for p in missing_next_action],
        "unclear_ownership": [project_row(p) for p in unclear_ownership],
        "inactive_programs": inactive_programs,
        "unexamined_scopes": unexamined_scopes,
        "inert_objectives": inert_objectives,
        "claims_awaiting_evaluation": claims_awaiting_evaluation,
        "overdue_delegations": [deleg_row(d) for d in overdue_delegations],
        "delegation_followups": [deleg_row(d) for d in delegation_followups],
        "unreviewed_deliverables": [deleg_row(d) for d in unreviewed_deliverables],
        "my_inbox": [request_row(r) for r in my_inbox],
        "open_requests": [request_row(r) for r in open_requests],
        "request_followups": [request_row(r) for r in request_followups],
        "waiting_without_blocker": [task_row(t) for t in waiting_no_blocker],
        "delegated_without_owner": [task_row(t) for t in delegated_no_owner],
        "completed_with_open_tasks": [
            project_row(p) for p in completed_with_open_tasks
        ],
    }


router.include_router(dashboard)
