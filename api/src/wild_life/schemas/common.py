"""Shared schema base classes and enums."""

import uuid
from datetime import datetime
from typing import Annotated, Literal

from pydantic import BaseModel, BeforeValidator, ConfigDict

from wild_life.phone import normalize_phone

# --- shared enums -----------------------------------------------------------
Priority = Literal["low", "medium", "high", "urgent"]
AreaStatus = Literal["active", "inactive", "archived"]
# A program is anything you have decided to pay attention to — an effort you are
# mounting or a condition you are carrying. `monitoring` is what keeps the second
# kind from reading as a neglected program. There is deliberately no `chronic`:
# it conflated how long a thing lasts with what state it is in.
ProgramStatus = Literal[
    "proposed", "active", "monitoring", "paused", "resolved", "cancelled"
]
# Health facet of a program, carried by the former conditions.
HealthCategory = Literal[
    "gastrointestinal",
    "cardiovascular",
    "dermatologic",
    "musculoskeletal",
    "urologic",
    "auditory",
    "mental_health",
    "other",
]
ProjectStatus = Literal[
    "proposed", "active", "waiting", "paused", "completed", "cancelled", "archived"
]
TaskStatus = Literal[
    "inbox",
    "planned",
    "in_progress",
    "waiting",
    "delegated",
    "delivered",
    "completed",
    "cancelled",
]
RoutineStatus = Literal["active", "paused", "archived"]
# How often a metric is expected to be read. Its one effect: the review dashboard
# flags a metric whose latest entry is older than this (see routers/reviews.py).
MeasurementFrequency = Literal["daily", "weekly", "monthly", "quarterly", "yearly"]
# Where a metric's readings come from. Hand-logged measurement does not happen
# here — 19 readings against 404 completed tasks over the same period — so a
# metric that the app can compute for itself should compute itself.
MetricSource = Literal["manual", "derived"]
# The computations a derived metric can name. Each reads data the app already
# holds and needs no entry UI at all.
DerivationKey = Literal["task_throughput", "routine_adherence"]
RoutineInstanceStatus = Literal["pending", "done", "skipped"]
OutcomeStatus = Literal["active", "achieved", "paused", "dropped"]
# What kind of claim an outcome makes. A standard must hold continuously, a target
# must become true by a date, a deliverable is accepted once. The kind is declared
# rather than inferred from which fields are filled: capture asks for exactly the
# right ones, and the evaluator has a single rule per kind.
OutcomeKind = Literal["standard", "target", "deliverable"]
CommitmentStatus = Literal[
    "open", "in_progress", "waiting", "fulfilled", "broken", "cancelled"
]
RequestKind = Literal["question", "decision", "input", "deliverable"]
RequestStatus = Literal["open", "resolved", "cancelled"]
# NOTE: the former WaitingItem/WaitingStatus is folded into Request (kind=deliverable).
DelegationStatus = Literal[
    "draft",
    "requested",
    "accepted",
    "in_progress",
    "waiting_for_update",
    "blocked",
    "delivered",
    "revision_requested",
    "accepted_as_complete",
    "declined",
    "reassigned",
    "cancelled",
]
TokenRole = Literal["full", "worker"]
# Canonical cross-entity phase (see lifecycle.py) — one uniform "state of work".
LifecyclePhase = Literal["backlog", "active", "blocked", "done", "cancelled"]
ReviewType = Literal[
    "daily",
    "weekly",
    "monthly",
    "quarterly",
    "area",
    "program",
    "project",
    "delegation",
]

# Soft polymorphic-link target types.
EntityType = Literal[
    "area",
    "program",
    "project",
    "task",
    "routine",
    "outcome",
    "metric",
    "event",
    "note",
    "person",
    "organization",
    "location",
    "commitment",
    "request",
    "delegation",
    "review",
    "resource",
    "decision",
    "medication",
    "protocol",
    "protocol_item",
    "insurance_plan",
    "allergy",
]


# --- canonical scalars ------------------------------------------------------
# Phones are stored E.164 (see `wild_life.phone`). Normalising here rather than
# in a route means every writer gets it — the web app, the OpenAPI-derived MCP
# tools, and any import script.
PhoneNumber = Annotated[str | None, BeforeValidator(normalize_phone)]


# --- base models ------------------------------------------------------------
class ORMModel(BaseModel):
    """Response base — reads attributes off SQLAlchemy instances."""

    model_config = ConfigDict(from_attributes=True)


class Entity(ORMModel):
    """Common fields on every persisted record."""

    id: uuid.UUID
    created_at: datetime
    updated_at: datetime


class IdentityRead(BaseModel):
    """Who the calling token acts as.

    `person_id` is the Person this token *is* — the owner's comes from
    `WILD_LIFE_SELF_PERSON_ID`, a worker token's from its own row. The web app
    uses it to put you at the top of assignee/responsible pickers, so it is
    resolved per token rather than read from a global default.
    """

    role: TokenRole
    person_id: uuid.UUID | None
