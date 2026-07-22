"""ORM models — import all so Base.metadata and Alembic see every table."""

from wild_life.models.auth import ApiToken
from wild_life.models.calendar import Event
from wild_life.models.core import Area, Program, Project, ProjectContributor
from wild_life.models.goals import Goal, GoalProject
from wild_life.models.health import (
    Allergy,
    Condition,
    HealthEvent,
    InsurancePlan,
    Medication,
    Protocol,
)
from wild_life.models.history import ChangeLog
from wild_life.models.knowledge import Decision, Resource
from wild_life.models.metrics import Metric, MetricEntry
from wild_life.models.locations import Location
from wild_life.models.notes import Note, NoteMention
from wild_life.models.organizations import Affiliation, Organization
from wild_life.models.people import Interaction, Person
from wild_life.models.push import PushSubscription, SentNudge, SentReminder
from wild_life.models.requests import Request
from wild_life.models.reviews import Review
from wild_life.models.routines import Routine, RoutineInstance
from wild_life.models.tags import EntityTag, Tag
from wild_life.models.tasks import Task
from wild_life.models.tracking import Commitment, Delegation

__all__ = [
    "Area",
    "Program",
    "Project",
    "ProjectContributor",
    "Task",
    "Routine",
    "RoutineInstance",
    "Goal",
    "GoalProject",
    "Condition",
    "Medication",
    "Protocol",
    "HealthEvent",
    "InsurancePlan",
    "Allergy",
    "Metric",
    "MetricEntry",
    "Event",
    "Note",
    "Person",
    "Interaction",
    "NoteMention",
    "Organization",
    "Affiliation",
    "PushSubscription",
    "SentReminder",
    "SentNudge",
    "Location",
    "Commitment",
    "Request",
    "Delegation",
    "Review",
    "Resource",
    "Decision",
    "Tag",
    "EntityTag",
    "ChangeLog",
    "ApiToken",
]
