// The public type surface for the API.
//
// Entity shapes are GENERATED from the API's OpenAPI document (`pnpm gen:api` →
// `schema.gen.ts`), so they cannot drift from what the routers actually return.
// This module only *names* them — `Task` reads better than
// `components["schemas"]["TaskRead"]` at 100+ call sites.
//
// Enum unions are derived from the entity that carries them, so adding a status
// on the backend widens the union here automatically.

import type { Instant } from "@/lib/date"
import type { components } from "@/services/api/schema.gen"

type S = components["schemas"]

export type ID = string

/** The structural base every persisted record satisfies. Not a spec schema —
 *  the API repeats these three fields on each Read model rather than composing. */
export interface Entity {
  id: ID
  created_at: Instant
  updated_at: Instant
}

// --- entities ---------------------------------------------------------------
export type Area = S["AreaRead"]
export type Program = S["ProgramRead"]
export type Project = S["ProjectRead"]
export type Task = S["TaskRead"]
export type Person = S["PersonRead"]
export type Interaction = S["InteractionRead"]
export type Organization = S["OrganizationRead"]
export type Location = S["LocationRead"]
export type Affiliation = S["AffiliationRead"]
export type Routine = S["RoutineRead"]
export type RoutineInstance = S["RoutineInstanceRead"]
export type Goal = S["GoalRead"]
export type Metric = S["MetricRead"]
export type MetricEntry = S["MetricEntryRead"]
export type EventItem = S["EventRead"]
export type Note = S["NoteRead"]
export type NoteImage = S["NoteImageRead"]
export type Commitment = S["CommitmentRead"]
export type Request = S["RequestRead"]
export type Delegation = S["DelegationRead"]
export type Review = S["ReviewRead"]
export type Resource = S["ResourceRead"]
export type Decision = S["DecisionRead"]
export type Tag = S["TagRead"]
export type Condition = S["ConditionRead"]
export type Medication = S["MedicationRead"]
export type Protocol = S["ProtocolRead"]
export type InsurancePlan = S["InsurancePlanRead"]
export type Allergy = S["AllergyRead"]

// --- value shapes carried on entities ---------------------------------------
export type ContactMethod = S["ContactMethod"]
export type ImportantDate = S["ImportantDate"]
export type GuestStatus = S["GuestStatus"]
export type RegimenEntry = S["RegimenEntry"]
/** A note's outbound mention (soft-polymorphic target). */
export type NoteLink = S["EntityRef"]

/** Who the current token acts as — see `useSelfPersonId`. */
export type Identity = S["IdentityRead"]

// --- computed responses -----------------------------------------------------
export type ComputedProgress = S["ComputedProgress"]
export type DashRow = S["DashRow"]
export type ReviewDashboard = S["ReviewDashboard"]

// --- enums (derived from the entity that carries them) ----------------------
export type Priority = Task["priority"]
export type AreaStatus = Area["status"]
export type ProgramStatus = Program["status"]
export type ProjectStatus = Project["status"]
export type TaskStatus = Task["status"]
export type RoutineStatus = Routine["status"]
export type RoutineInstanceStatus = RoutineInstance["status"]
export type GoalStatus = Goal["status"]
export type CommitmentStatus = Commitment["status"]
export type RequestKind = Request["kind"]
export type RequestStatus = Request["status"]
export type DelegationStatus = Delegation["status"]
export type OrgStatus = Organization["status"]
export type ReviewType = Review["review_type"]
export type EntityType = NonNullable<Note["entity_type"]>

// --- health enums -----------------------------------------------------------
export type ConditionCategory = NonNullable<Condition["category"]>
export type ConditionStatus = Condition["status"]
export type MedType = Medication["med_type"]
export type PlanType = NonNullable<InsurancePlan["plan_type"]>
export type PlanStatus = InsurancePlan["status"]
export type AllergyType = NonNullable<Allergy["allergy_type"]>
export type AllergySeverity = NonNullable<Allergy["severity"]>
export type AllergyStatus = Allergy["status"]

/** A protocol's lifecycle is derived client-side (planned/active/completed from
 *  its window); `paused` is the one stored bit. Display state, not an API enum. */
export type ProtocolState = "paused" | "planned" | "active" | "completed"
