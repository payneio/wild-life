"""ORM models — import all so Base.metadata and Alembic see every table."""

from personal_api.models.calendar import Event
from personal_api.models.core import Area, Program, Project, ProjectContributor
from personal_api.models.goals import Goal, GoalProject
from personal_api.models.health import (
    Allergy,
    Condition,
    HealthEvent,
    InsurancePlan,
    Medication,
    MedicationDose,
    Protocol,
    ProtocolItem,
)
from personal_api.models.history import ChangeLog
from personal_api.models.knowledge import Decision, Resource
from personal_api.models.metrics import Metric, MetricEntry
from personal_api.models.locations import Location
from personal_api.models.notes import Note, NoteMention
from personal_api.models.organizations import Affiliation, Organization
from personal_api.models.people import Interaction, Person
from personal_api.models.push import PushSubscription, SentNudge, SentReminder
from personal_api.models.reviews import Review
from personal_api.models.routines import Routine, RoutineInstance
from personal_api.models.tags import EntityTag, Tag
from personal_api.models.tasks import Task
from personal_api.models.tracking import Commitment, Delegation, WaitingItem

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
    "MedicationDose",
    "Protocol",
    "ProtocolItem",
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
    "WaitingItem",
    "Delegation",
    "Review",
    "Resource",
    "Decision",
    "Tag",
    "EntityTag",
    "ChangeLog",
]
