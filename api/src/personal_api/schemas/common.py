"""Shared schema base classes and enums."""

import uuid
from datetime import datetime
from typing import Literal

from pydantic import BaseModel, ConfigDict

# --- shared enums -----------------------------------------------------------
Priority = Literal["low", "medium", "high", "urgent"]
AreaStatus = Literal["active", "inactive", "archived"]
ProgramStatus = Literal["proposed", "active", "paused", "completed", "cancelled"]
ProjectStatus = Literal[
    "proposed", "active", "waiting", "paused", "completed", "cancelled"
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
RoutineInstanceStatus = Literal["pending", "done", "skipped"]
GoalStatus = Literal["active", "achieved", "paused", "dropped"]
CommitmentStatus = Literal[
    "open", "in_progress", "waiting", "fulfilled", "broken", "cancelled"
]
WaitingStatus = Literal["open", "received", "overdue", "cancelled"]
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
    "goal",
    "metric",
    "event",
    "note",
    "person",
    "commitment",
    "waiting_item",
    "delegation",
    "review",
    "resource",
    "decision",
    "condition",
    "medication",
    "protocol",
    "protocol_item",
    "health_event",
    "insurance_plan",
    "allergy",
]


# --- base models ------------------------------------------------------------
class ORMModel(BaseModel):
    """Response base — reads attributes off SQLAlchemy instances."""

    model_config = ConfigDict(from_attributes=True)


class Entity(ORMModel):
    """Common fields on every persisted record."""

    id: uuid.UUID
    created_at: datetime
    updated_at: datetime
