"""Shared schema base classes and enums."""

import uuid
from datetime import datetime
from typing import Annotated, Any, Literal

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
DerivationKey = Literal[
    "task_throughput",
    "routine_adherence",
    # A relationship between two other metrics, read within one occasion.
    # Storing the quotient would store a fact you can always recover — and
    # one that can go stale, as the imported spreadsheet proved.
    "ratio",
    "percent",
]
# The derivations that read two other metrics rather than a table of rows. Named
# once so the schema validator and the computation can't disagree about which.
TWO_OPERAND_DERIVATIONS = ("ratio", "percent")
RoutineInstanceStatus = Literal["pending", "done", "skipped"]
OutcomeStatus = Literal["active", "achieved", "paused", "dropped"]
# What kind of claim an outcome makes: a standard must hold continuously, a target
# must become true by a date. Both are *measured*, which is what an outcome is —
# and the kind is declared rather than inferred from which fields are filled, so
# capture asks for exactly the right ones and the evaluator has one rule per kind.
#
# `deliverable` was a third, and was retired for restating its root: every one was
# on a project and every project outcome was one, because the "Done when" panel
# defaulted the kind by rung. That is `note_type` again — journal meant "about
# me", deliverable meant "about a project". A project's completion is its tasks
# and its status; tasks are what define when things get done.
OutcomeKind = Literal["standard", "target"]
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
# --- moments ----------------------------------------------------------------
# The act a moment *is*. Never its subject (which is what killed `note_type`),
# never its target type (the links say that), and never its tense — a planned
# lunch and a lunch you ate are both `occasion`, differing only in whether the
# occurrence has happened yet.
#
# Every kind is written by the surface that creates the moment; no surface asks
# the user. `Event.event_type` is null on 1,283 of 1,332 rows, which is what a
# hand-set facet is worth, and this one carries the inbox predicate, the journal
# and the default reading filter. `capture` is the one surface that cannot know —
# you typed something and have not said what it is — and that *is* the inbox.
#
# See `api/docs/moments.md` for the full table, including what is deliberately
# absent (`appointment`, `milestone`, `intention`, `lapsed`).
MomentKind = Literal[
    "capture",
    "reflection",
    "observation",
    "occasion",
    "exchange",
    "visit",
    "measurement",
    "dose",
    "activity",
    "work",
    "completion",
    "withdrawal",
    "decision",
]
# How a moment involves a thing. Four, closed, and about the *manner* of the
# involvement rather than what is on the other end — a per-type vocabulary
# (`doses`, `measures`) would restate kind + target type, which is the redundancy
# that retired `note_type`. `subject` puts the moment on a thing's timeline;
# `mention` puts it in that thing's backlinks.
MomentRole = Literal["participant", "place", "subject", "mention"]
# Who made the moment. `derived` rows are rebuildable from their source (a visit
# from pings), which is the property a rebuild must respect — see LocationVisit.
MomentSource = Literal["authored", "derived", "imported"]

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
#
# `event` and `note` are deliberately absent. Both were retired by the inversion
# — an event is an `occasion` moment and a note is a prose one — and a type that
# can still be *named* but no longer constructed is a constructor for something
# that cannot exist. Every consumer had to carry a branch for two cases that
# could only 404.
EntityType = Literal[
    "area",
    "program",
    "project",
    "task",
    "routine",
    "outcome",
    "metric",
    "metric_group",
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
    # A moment can be about another moment — the 38 notes rooted at an event are
    # exactly that, and both ends become moments.
    "moment",
]


# --- canonical scalars ------------------------------------------------------
# Phones are stored E.164 (see `wild_life.phone`). Normalising here rather than
# in a route means every writer gets it — the web app, the OpenAPI-derived MCP
# tools, and any import script.
PhoneNumber = Annotated[str | None, BeforeValidator(normalize_phone)]


# --- postal addresses -------------------------------------------------------
# One address vocabulary for the whole app. The components are the intersection
# of vCard's ``ADR`` (RFC 6350) and schema.org's ``PostalAddress``, which agree
# on everything that matters:
#
#   street    ADR street          / streetAddress
#   unit      ADR extended        / (folded into streetAddress)
#   city      ADR locality        / addressLocality
#   region    ADR region          / addressRegion
#   postcode  ADR postal code     / postalCode
#   country   ADR country         / addressCountry
#
# ``region`` is the standard's own name, and it is deliberately vague: it is a
# state in the US, a province in Canada, a county in the UK. Naming it after any
# one of those would be wrong everywhere else.
#
# Where a record has exactly one address (Location, Organization) these are real
# columns, so they can be searched, sorted and filtered. Where it has several
# (Person: home, work, …) they are the fields of a JSON object in a list. Same
# vocabulary, two carriers — the shape follows cardinality, not fashion.
ADDRESS_FIELDS = ("street", "unit", "city", "region", "postcode", "country")


class PostalAddress(BaseModel):
    """One address, in the shared vocabulary."""

    street: str | None = None
    # Apartment, suite, floor, building — vCard's "extended address". Its absence
    # is why an address with a unit number used to have nowhere to go.
    unit: str | None = None
    city: str | None = None
    region: str | None = None
    postcode: str | None = None
    country: str | None = None


class LabelledAddress(PostalAddress):
    """An address in a list, so it needs to say which one it is."""

    label: str | None = None  # home / work / …


def format_address(address: Any, *, sep: str = ", ") -> str:
    """Flatten an address for somewhere that only takes a string.

    Used for the iCalendar ``LOCATION`` line and map links. Reads either a model
    or a mapping, so it works for both carriers.
    """
    get = (
        address.get
        if isinstance(address, dict)
        else lambda k: getattr(address, k, None)
    )
    street = " ".join(p for p in (get("street"), get("unit")) if p)
    parts = [street, get("city"), get("region"), get("postcode"), get("country")]
    return sep.join(p for p in parts if p)


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
