"""ORM models — import all so Base.metadata and Alembic see every table."""

from personal_api.models.calendar import Event
from personal_api.models.core import Area, Program, Project, ProjectContributor
from personal_api.models.goals import Goal, GoalProject
from personal_api.models.knowledge import Decision, Resource
from personal_api.models.metrics import Metric, MetricEntry
from personal_api.models.notes import Note
from personal_api.models.people import Interaction, Person
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
    "Metric",
    "MetricEntry",
    "Event",
    "Note",
    "Person",
    "Interaction",
    "Commitment",
    "WaitingItem",
    "Delegation",
    "Review",
    "Resource",
    "Decision",
    "Tag",
    "EntityTag",
]
