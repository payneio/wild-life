// The one runtime source for enum option lists.
//
// TypeScript unions are erased, so a dropdown still needs a real array at
// runtime — but that array no longer floats free. Each is checked with
// `satisfies readonly X[]` against the union generated from the API, so renaming
// a value on the backend breaks the build here instead of silently producing a
// dropdown option the API rejects.
//
// Both consumers read these: the detail layouts in `entities/`, and the create
// form's FieldSpecs in `fields.ts`. Listing them twice is how a value ends up
// offered in one surface and missing from the other.

import type {
  AllergySeverity,
  AllergyStatus,
  AllergyType,
  AreaStatus,
  CommitmentStatus,
  ConditionCategory,
  ConditionStatus,
  DelegationStatus,
  GoalStatus,
  MedType,
  OrgStatus,
  PlanStatus,
  PlanType,
  Priority,
  ProgramStatus,
  ProjectStatus,
  RequestKind,
  RequestStatus,
  ReviewType,
  RoutineStatus,
  TaskStatus,
} from "@/services/api/types"

export const PRIORITIES = ["low", "medium", "high", "urgent"] as const satisfies readonly Priority[]

export const AREA_STATUS = [
  "active",
  "inactive",
  "archived",
] as const satisfies readonly AreaStatus[]

export const PROGRAM_STATUS = [
  "proposed",
  "active",
  "paused",
  "completed",
  "cancelled",
] as const satisfies readonly ProgramStatus[]

export const PROJECT_STATUS = [
  "proposed",
  "active",
  "waiting",
  "paused",
  "completed",
  "cancelled",
  "archived",
] as const satisfies readonly ProjectStatus[]

export const TASK_STATUS = [
  "inbox",
  "planned",
  "in_progress",
  "waiting",
  "delegated",
  "delivered",
  "completed",
  "cancelled",
] as const satisfies readonly TaskStatus[]

export const GOAL_STATUS = [
  "active",
  "achieved",
  "paused",
  "dropped",
] as const satisfies readonly GoalStatus[]

export const ROUTINE_STATUS = [
  "active",
  "paused",
  "archived",
] as const satisfies readonly RoutineStatus[]

export const DELEGATION_STATUS = [
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
] as const satisfies readonly DelegationStatus[]

export const COMMIT_STATUS = [
  "open",
  "in_progress",
  "waiting",
  "fulfilled",
  "broken",
  "cancelled",
] as const satisfies readonly CommitmentStatus[]

export const REQUEST_KIND = [
  "question",
  "decision",
  "input",
  "deliverable",
] as const satisfies readonly RequestKind[]

export const REQUEST_STATUS = [
  "open",
  "resolved",
  "cancelled",
] as const satisfies readonly RequestStatus[]

export const REVIEW_TYPE = [
  "daily",
  "weekly",
  "monthly",
  "quarterly",
  "area",
  "program",
  "project",
  "delegation",
] as const satisfies readonly ReviewType[]

export const CONDITION_CATEGORY = [
  "gastrointestinal",
  "cardiovascular",
  "dermatologic",
  "musculoskeletal",
  "urologic",
  "auditory",
  "mental_health",
  "other",
] as const satisfies readonly ConditionCategory[]

export const CONDITION_STATUS = [
  "active",
  "monitoring",
  "chronic",
  "resolved",
  "ruled_out",
] as const satisfies readonly ConditionStatus[]

export const MED_TYPE = [
  "prescription",
  "otc",
  "supplement",
] as const satisfies readonly MedType[]

export const PLAN_TYPE = [
  "medical",
  "dental",
  "vision",
  "pharmacy",
] as const satisfies readonly PlanType[]

export const ALLERGY_TYPE = [
  "medication",
  "food",
  "environmental",
  "other",
] as const satisfies readonly AllergyType[]

export const ALLERGY_SEVERITY = [
  "mild",
  "moderate",
  "severe",
  "unknown",
] as const satisfies readonly AllergySeverity[]

export const ALLERGY_STATUS = [
  "active",
  "suspected",
  "resolved",
] as const satisfies readonly AllergyStatus[]

export const ORG_STATUS = [
  "active",
  "inactive",
  "archived",
] as const satisfies readonly OrgStatus[]

export const PLAN_STATUS = ["active", "inactive"] as const satisfies readonly PlanStatus[]

// --- lists the API types as plain strings (no Literal on the backend) --------
export const ORG_TYPE = [
  "employer",
  "client",
  "vendor",
  "partner",
  "nonprofit",
  "school",
  "government",
  "community",
  "other",
] as const
export const LOCATION_CATEGORY = ["home", "work", "venue", "city", "other"] as const
export const RESOURCE_TYPE = [
  "link",
  "document",
  "book",
  "template",
  "tool",
  "account",
  "location",
  "reference",
] as const
export const EVENT_TYPE = [
  "meeting",
  "appointment",
  "call",
  "lab",
  "procedure",
  "surgery",
  "imaging",
  "test",
  "vaccination",
  "injury",
  "symptom",
  "note",
  "other",
] as const
