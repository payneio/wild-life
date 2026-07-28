"""ORM models — import all so Base.metadata and Alembic see every table."""

from wild_life.models.auth import ApiToken
from wild_life.models.calendar import AttendeeResponse, Event, SentInvite
from wild_life.models.core import Area, Program, Project, ProjectContributor
from wild_life.models.health import (
    Allergy,
    InsurancePlan,
    Medication,
)
from wild_life.models.protocols import Protocol
from wild_life.models.history import ChangeLog
from wild_life.models.knowledge import Decision, Resource
from wild_life.models.links import EntityLink
from wild_life.models.metrics import Metric, MetricEntry
from wild_life.models.locations import (
    GeocodeCache,
    Location,
    LocationPing,
    LocationVisit,
    PlaceCandidate,
)
from wild_life.models.notes import Note, NoteMention
from wild_life.models.outcomes import Outcome
from wild_life.models.organizations import Affiliation, Organization
from wild_life.models.people import Person
from wild_life.models.preferences import Preference
from wild_life.models.push import PushSubscription, SentNudge, SentReminder
from wild_life.models.requests import Request
from wild_life.models.reviews import Review
from wild_life.models.routines import Routine, RoutineInstance
from wild_life.models.tasks import Task
from wild_life.models.tracking import Commitment, Delegation
from wild_life.models.whiteboard import Whiteboard

__all__ = [
    "Area",
    "Program",
    "Project",
    "ProjectContributor",
    "Task",
    "Routine",
    "RoutineInstance",
    "Outcome",
    "Medication",
    "Protocol",
    "InsurancePlan",
    "Allergy",
    "Metric",
    "MetricEntry",
    "Event",
    "SentInvite",
    "AttendeeResponse",
    "Preference",
    "Whiteboard",
    "Note",
    "Person",
    "NoteMention",
    "Organization",
    "Affiliation",
    "PushSubscription",
    "SentReminder",
    "SentNudge",
    "Location",
    "LocationPing",
    "LocationVisit",
    "PlaceCandidate",
    "GeocodeCache",
    "Commitment",
    "Request",
    "Delegation",
    "Review",
    "Resource",
    "Decision",
    "EntityLink",
    "ChangeLog",
    "ApiToken",
]
