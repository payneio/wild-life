import type { ComponentType } from "react"
import type { FieldSpec } from "@/components/EntityForm"
import {
  AreaExtra,
  GoalExtra,
  MetricExtra,
  OrganizationExtra,
  ProjectExtra,
  ProtocolExtra,
  RoutineExtra,
} from "@/components/detailExtras"
import type { createCrud } from "@/services/api/crud"
import type { Entity, EntityType } from "@/services/api/types"
import {
  allergies,
  areas,
  commitments,
  conditions,
  decisions,
  delegations,
  events,
  goals,
  healthEvents,
  insurancePlans,
  locations,
  medications,
  metrics,
  notes,
  organizations,
  programs,
  projects,
  protocols,
  resources,
  reviews,
  routines,
  tags,
  tasks,
  waitingItems,
} from "@/services/api/hooks"

type Crud<T extends Entity> = ReturnType<typeof createCrud<T>>

/** Everything the generic list + detail + edit machinery needs per entity. */
export interface EntityDef {
  key: string
  label: string
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  crud: Crud<any>
  fields: FieldSpec[]
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  title: (e: any) => string
  entityType?: EntityType
  /** Optional rich section shown below the shared field list in the detail view. */
  extra?: ComponentType<{ entity: Entity }>
}

// --- option lists -----------------------------------------------------------
const PRIORITIES = ["low", "medium", "high", "urgent"] as const
const PROGRAM_STATUS = ["proposed", "active", "paused", "completed", "cancelled"] as const
const TASK_STATUS = [
  "inbox", "planned", "in_progress", "waiting", "delegated", "delivered", "completed", "cancelled",
] as const
const DELEGATION_STATUS = [
  "draft", "requested", "accepted", "in_progress", "waiting_for_update", "blocked",
  "delivered", "revision_requested", "accepted_as_complete", "declined", "reassigned", "cancelled",
] as const
const COMMIT_STATUS = ["open", "in_progress", "waiting", "fulfilled", "broken", "cancelled"] as const
const WAITING_STATUS = ["open", "received", "overdue", "cancelled"] as const
const REVIEW_TYPE = ["daily", "weekly", "monthly", "quarterly", "area", "program", "project", "delegation"] as const
const ORG_STATUS = ["active", "inactive", "archived"] as const
const CONDITION_CATEGORY = [
  "gastrointestinal", "cardiovascular", "dermatologic", "musculoskeletal",
  "urologic", "auditory", "mental_health", "other",
] as const
const CONDITION_STATUS = ["active", "monitoring", "chronic", "resolved", "ruled_out"] as const
const MED_TYPE = ["prescription", "otc", "supplement"] as const
const MED_STATUS = ["active", "discontinued", "as_needed", "planned", "completed"] as const
const PROTOCOL_STATUS = ["planned", "active", "paused", "completed", "abandoned"] as const
const EVENT_TYPE = [
  "appointment", "lab", "procedure", "surgery", "imaging", "test", "vaccination", "injury", "symptom", "note",
] as const
const PLAN_TYPE = ["medical", "dental", "vision", "pharmacy"] as const
const ALLERGY_TYPE = ["medication", "food", "environmental", "other"] as const
const ALLERGY_SEVERITY = ["mild", "moderate", "severe", "unknown"] as const
const ALLERGY_STATUS = ["active", "suspected", "resolved"] as const

// --- field specs (shared by list edit-form + detail view) -------------------
export const PROGRAM_FIELDS: FieldSpec[] = [
  { name: "name", label: "Name" },
  { name: "area_id", label: "Area", type: "entity", lookup: "area" },
  { name: "status", label: "Status", type: "select", options: PROGRAM_STATUS },
  { name: "intended_outcome", label: "Intended outcome", type: "textarea" },
  { name: "success_criteria", label: "Success criteria", type: "textarea" },
  { name: "start_date", label: "Start", type: "date" },
  { name: "target_date", label: "Target", type: "date" },
  { name: "review_frequency", label: "Review frequency" },
  { name: "reporting_cadence", label: "Reporting cadence" },
  { name: "notes", label: "Notes", type: "textarea" },
]

export const EVENT_FIELDS: FieldSpec[] = [
  { name: "title", label: "Title", full: true },
  { name: "start_at", label: "Start", type: "datetime" },
  { name: "end_at", label: "End", type: "datetime" },
  { name: "all_day", label: "All day", type: "checkbox" },
  { name: "location", label: "Location" },
  { name: "attendees", label: "Attendees", type: "tags" },
  { name: "area_id", label: "Area", type: "entity", lookup: "area" },
  { name: "project_id", label: "Project", type: "entity", lookup: "project" },
  { name: "notes", label: "Notes", type: "textarea" },
]

export const NOTE_FIELDS: FieldSpec[] = [
  { name: "title", label: "Title", full: true },
  { name: "note_type", label: "Type", type: "select", options: ["note", "journal", "idea", "meeting", "reference"] },
  { name: "entry_date", label: "Date", type: "date" },
  { name: "mood", label: "Mood" },
  { name: "tags", label: "Tags", type: "tags" },
  { name: "body", label: "Body", type: "textarea", full: true },
]

export const COMMITMENT_FIELDS: FieldSpec[] = [
  { name: "description", label: "Description", type: "textarea", full: true },
  { name: "beneficiary_id", label: "To (person)", type: "entity", lookup: "people" },
  { name: "responsible_id", label: "Responsible", type: "entity", lookup: "people" },
  { name: "status", label: "Status", type: "select", options: COMMIT_STATUS },
  { name: "date_made", label: "Made on", type: "date" },
  { name: "due_date", label: "Due", type: "date" },
  { name: "evidence", label: "Evidence", type: "textarea" },
  { name: "notes", label: "Notes", type: "textarea" },
]

export const WAITING_FIELDS: FieldSpec[] = [
  { name: "expected_result", label: "Expecting", type: "textarea", full: true },
  { name: "person_id", label: "From (person)", type: "entity", lookup: "people" },
  { name: "from_org", label: "From (org)" },
  { name: "status", label: "Status", type: "select", options: WAITING_STATUS },
  { name: "date_requested", label: "Requested", type: "date" },
  { name: "expected_date", label: "Expected", type: "date" },
  { name: "follow_up_date", label: "Follow up", type: "date" },
  { name: "next_action", label: "Next action" },
  { name: "last_communication", label: "Last contact", type: "textarea" },
  { name: "notes", label: "Notes", type: "textarea" },
]

export const DECISION_FIELDS: FieldSpec[] = [
  { name: "question", label: "Question", type: "textarea", full: true },
  { name: "options_considered", label: "Options considered", type: "textarea" },
  { name: "decision", label: "Decision", type: "textarea" },
  { name: "rationale", label: "Rationale", type: "textarea" },
  { name: "assumptions", label: "Assumptions", type: "textarea" },
  { name: "owner_id", label: "Owner", type: "entity", lookup: "people" },
  { name: "decided_on", label: "Decided on", type: "date" },
  { name: "review_date", label: "Review on", type: "date" },
]

export const RESOURCE_FIELDS: FieldSpec[] = [
  { name: "title", label: "Title", full: true },
  { name: "resource_type", label: "Type", type: "select", options: ["link", "document", "book", "template", "tool", "account", "location", "reference"] },
  { name: "url", label: "URL", full: true },
  { name: "description", label: "Description", type: "textarea" },
  { name: "tags", label: "Tags", type: "tags" },
]

export const TAG_FIELDS: FieldSpec[] = [
  { name: "name", label: "Name" },
  { name: "color", label: "Color (hex)", placeholder: "#4f46e5" },
]

export const TASK_FIELDS: FieldSpec[] = [
  { name: "title", label: "Title", full: true },
  { name: "description", label: "Description", type: "textarea", full: true },
  { name: "status", label: "Status", type: "select", options: TASK_STATUS },
  { name: "priority", label: "Priority", type: "select", options: PRIORITIES },
  { name: "area_id", label: "Area", type: "entity", lookup: "area" },
  { name: "program_id", label: "Program", type: "entity", lookup: "program" },
  { name: "project_id", label: "Project", type: "entity", lookup: "project" },
  { name: "assignee_id", label: "Assignee", type: "entity", lookup: "people" },
  { name: "responsible_id", label: "Responsible", type: "entity", lookup: "people" },
  { name: "scheduled_date", label: "Scheduled", type: "date" },
  { name: "due_date", label: "Due", type: "date" },
  { name: "estimated_minutes", label: "Estimate (min)", type: "number" },
  { name: "context", label: "Context", placeholder: "@home, @calls" },
  { name: "recurrence", label: "Recurrence", placeholder: "daily / weekly / monthly" },
  { name: "waiting_on", label: "Waiting on" },
  { name: "acceptance_required", label: "Requires acceptance", type: "checkbox" },
  { name: "notes", label: "Notes", type: "textarea", full: true },
]

export const DELEGATION_FIELDS: FieldSpec[] = [
  { name: "requested_outcome", label: "Requested outcome", type: "textarea", full: true },
  { name: "responsible_id", label: "Responsible", type: "entity", lookup: "people" },
  { name: "accountable_owner_id", label: "Accountable", type: "entity", lookup: "people" },
  { name: "status", label: "Status", type: "select", options: DELEGATION_STATUS },
  { name: "priority", label: "Priority", type: "select", options: PRIORITIES },
  { name: "date_delegated", label: "Delegated on", type: "date" },
  { name: "expected_completion_date", label: "Expected", type: "date" },
  { name: "follow_up_date", label: "Follow up", type: "date" },
  { name: "acceptance_required", label: "Requires acceptance", type: "checkbox" },
  { name: "escalation_level", label: "Escalation", type: "number" },
  { name: "instructions", label: "Instructions", type: "textarea", full: true },
  { name: "latest_update", label: "Latest update", type: "textarea", full: true },
  { name: "last_contact_date", label: "Last contact", type: "date" },
  { name: "notes", label: "Notes", type: "textarea", full: true },
]

export const REVIEW_FIELDS: FieldSpec[] = [
  { name: "review_type", label: "Type", type: "select", options: REVIEW_TYPE },
  { name: "period_start", label: "Period start", type: "date" },
  { name: "period_end", label: "Period end", type: "date" },
  { name: "observations", label: "Observations", type: "textarea", full: true },
  { name: "decisions", label: "Decisions", type: "textarea", full: true },
  { name: "risks", label: "Risks", type: "textarea", full: true },
  { name: "follow_up_actions", label: "Follow-up actions", type: "textarea", full: true },
  { name: "completed_at", label: "Completed", type: "datetime" },
  { name: "notes", label: "Notes", type: "textarea", full: true },
]

export const ORGANIZATION_FIELDS: FieldSpec[] = [
  { name: "name", label: "Name" },
  { name: "org_type", label: "Type", type: "select", options: ["employer", "client", "vendor", "partner", "nonprofit", "school", "government", "community", "other"] },
  { name: "industry", label: "Industry" },
  { name: "status", label: "Status", type: "select", options: ORG_STATUS },
  { name: "website", label: "Website", full: true },
  { name: "email", label: "Email" },
  { name: "phone", label: "Phone" },
  { name: "address", label: "Address", full: true },
  { name: "description", label: "Description", type: "textarea", full: true },
  { name: "notes", label: "Notes", type: "textarea", full: true },
]

export const LOCATION_FIELDS: FieldSpec[] = [
  { name: "name", label: "Name" },
  { name: "category", label: "Category", type: "select", options: ["home", "work", "venue", "city", "other"] },
  { name: "address", label: "Address", full: true },
  { name: "city", label: "City" },
  { name: "region", label: "Region" },
  { name: "notes", label: "Notes", type: "textarea", full: true },
]

export const CONDITION_FIELDS: FieldSpec[] = [
  { name: "name", label: "Name" },
  { name: "category", label: "Category", type: "select", options: CONDITION_CATEGORY },
  { name: "status", label: "Status", type: "select", options: CONDITION_STATUS },
  { name: "area_id", label: "Area", type: "entity", lookup: "area" },
  { name: "program_id", label: "Program", type: "entity", lookup: "program" },
  { name: "severity", label: "Severity" },
  { name: "onset_date", label: "Onset", type: "date" },
  { name: "resolved_date", label: "Resolved", type: "date" },
  { name: "diagnosed_by_id", label: "Diagnosed by", type: "entity", lookup: "people" },
  { name: "description", label: "Description", type: "textarea", full: true },
  { name: "notes", label: "Notes", type: "textarea", full: true },
]

export const MEDICATION_FIELDS: FieldSpec[] = [
  { name: "name", label: "Name" },
  { name: "brand", label: "Brand" },
  { name: "generic_name", label: "Generic name" },
  { name: "med_type", label: "Type", type: "select", options: MED_TYPE },
  { name: "strength", label: "Strength", placeholder: "40mg" },
  { name: "dose", label: "Dose", placeholder: "1 tablet" },
  { name: "status", label: "Status", type: "select", options: MED_STATUS },
  { name: "start_date", label: "Started", type: "date" },
  { name: "end_date", label: "Stopped", type: "date" },
  { name: "condition_id", label: "For condition", type: "entity", lookup: "condition" },
  { name: "prescriber_id", label: "Prescriber", type: "entity", lookup: "people" },
  { name: "pharmacy_id", label: "Pharmacy", type: "entity", lookup: "organization" },
  { name: "reason", label: "Reason", type: "textarea" },
  { name: "instructions", label: "Instructions", type: "textarea" },
  { name: "notes", label: "Notes", type: "textarea", full: true },
]

export const PROTOCOL_FIELDS: FieldSpec[] = [
  { name: "name", label: "Name" },
  { name: "category", label: "Category" },
  { name: "status", label: "Status", type: "select", options: PROTOCOL_STATUS },
  { name: "area_id", label: "Area", type: "entity", lookup: "area" },
  { name: "program_id", label: "Program", type: "entity", lookup: "program" },
  { name: "duration", label: "Duration", placeholder: "4-6 wk" },
  { name: "start_date", label: "Start", type: "date" },
  { name: "end_date", label: "End", type: "date" },
  { name: "condition_id", label: "For condition", type: "entity", lookup: "condition" },
  { name: "provider_id", label: "Provider", type: "entity", lookup: "people" },
  { name: "intended_outcome", label: "Intended outcome", type: "textarea", full: true },
  { name: "notes", label: "Notes", type: "textarea", full: true },
]

export const HEALTH_EVENT_FIELDS: FieldSpec[] = [
  { name: "occurred_on", label: "Date", type: "date" },
  { name: "event_type", label: "Type", type: "select", options: EVENT_TYPE },
  { name: "title", label: "Title", full: true },
  { name: "provider_id", label: "Provider", type: "entity", lookup: "people" },
  { name: "organization_id", label: "Facility", type: "entity", lookup: "organization" },
  { name: "condition_id", label: "Condition", type: "entity", lookup: "condition" },
  { name: "summary", label: "Summary", type: "textarea", full: true },
  { name: "findings", label: "Findings / results", type: "textarea", full: true },
  { name: "recommendations", label: "Recommendations", type: "textarea", full: true },
  { name: "follow_up", label: "Follow-up", type: "textarea" },
  { name: "follow_up_date", label: "Follow-up date", type: "date" },
  { name: "location", label: "Location" },
  { name: "external_ref", label: "External ref", placeholder: "MyChart / OneDrive" },
  { name: "notes", label: "Notes", type: "textarea", full: true },
]

export const INSURANCE_FIELDS: FieldSpec[] = [
  { name: "name", label: "Plan name" },
  { name: "plan_type", label: "Type", type: "select", options: PLAN_TYPE },
  { name: "organization_id", label: "Insurer", type: "entity", lookup: "organization" },
  { name: "network", label: "Network" },
  { name: "member_id", label: "Member ID" },
  { name: "group_number", label: "Group #" },
  { name: "rx_bin", label: "RX BIN" },
  { name: "rx_pcn", label: "RX PCN" },
  { name: "rx_group", label: "RX Group" },
  { name: "phone", label: "Phone" },
  { name: "notes", label: "Notes", type: "textarea", full: true },
]

export const ALLERGY_FIELDS: FieldSpec[] = [
  { name: "substance", label: "Substance" },
  { name: "allergy_type", label: "Type", type: "select", options: ALLERGY_TYPE },
  { name: "reaction", label: "Reaction" },
  { name: "severity", label: "Severity", type: "select", options: ALLERGY_SEVERITY },
  { name: "status", label: "Status", type: "select", options: ALLERGY_STATUS },
  { name: "noted_on", label: "Noted on", type: "date" },
  { name: "notes", label: "Notes", type: "textarea", full: true },
]

export const AREA_FIELDS: FieldSpec[] = [
  { name: "name", label: "Name" },
  { name: "status", label: "Status", type: "select", options: ["active", "inactive", "archived"] },
  { name: "desired_standard", label: "Desired standard", type: "textarea", full: true },
  { name: "review_frequency", label: "Review frequency", placeholder: "weekly / monthly" },
  { name: "accountable_owner_id", label: "Accountable owner", type: "entity", lookup: "people" },
  { name: "description", label: "Description", type: "textarea", full: true },
  { name: "notes", label: "Notes", type: "textarea", full: true },
]

export const PROJECT_FIELDS: FieldSpec[] = [
  { name: "name", label: "Name", full: true },
  { name: "status", label: "Status", type: "select", options: ["proposed", "active", "waiting", "paused", "completed", "cancelled"] },
  { name: "priority", label: "Priority", type: "select", options: PRIORITIES },
  { name: "area_id", label: "Area", type: "entity", lookup: "area" },
  { name: "program_id", label: "Program", type: "entity", lookup: "program" },
  { name: "intended_outcome", label: "Intended outcome", type: "textarea", full: true },
  { name: "completion_criteria", label: "Completion criteria", type: "textarea", full: true },
  { name: "next_action", label: "Next action", full: true },
  { name: "start_date", label: "Start", type: "date" },
  { name: "target_date", label: "Target", type: "date" },
  { name: "last_activity_date", label: "Last activity", type: "date" },
  { name: "accountable_owner_id", label: "Accountable", type: "entity", lookup: "people" },
  { name: "responsible_lead_id", label: "Lead", type: "entity", lookup: "people" },
  { name: "notes", label: "Notes", type: "textarea", full: true },
]

export const GOAL_FIELDS: FieldSpec[] = [
  { name: "name", label: "Name", full: true },
  { name: "status", label: "Status", type: "select", options: ["active", "achieved", "paused", "dropped"] },
  { name: "area_id", label: "Area", type: "entity", lookup: "area" },
  { name: "metric_id", label: "Metric", type: "entity", lookup: "metric" },
  { name: "target_state", label: "Target state" },
  { name: "target_value", label: "Target value", type: "number" },
  { name: "baseline", label: "Baseline", type: "number" },
  { name: "progress", label: "Progress %", type: "number" },
  { name: "target_date", label: "Target date", type: "date" },
  { name: "measurement_method", label: "Measurement", full: true },
  { name: "description", label: "Description", type: "textarea", full: true },
  { name: "notes", label: "Notes", type: "textarea", full: true },
]

export const METRIC_FIELDS: FieldSpec[] = [
  { name: "name", label: "Name" },
  { name: "unit", label: "Unit" },
  { name: "area_id", label: "Area", type: "entity", lookup: "area" },
  { name: "target_value", label: "Target", type: "number" },
  { name: "target_min", label: "Target min", type: "number" },
  { name: "target_max", label: "Target max", type: "number" },
  { name: "measurement_frequency", label: "Frequency" },
  { name: "data_source", label: "Data source" },
  { name: "notes", label: "Notes", type: "textarea", full: true },
]

export const ROUTINE_FIELDS: FieldSpec[] = [
  { name: "name", label: "Name", full: true },
  { name: "area_id", label: "Area", type: "entity", lookup: "area" },
  { name: "frequency", label: "Frequency", placeholder: "daily / weekly / 3x-week" },
  { name: "preferred_days", label: "Preferred days", type: "tags", placeholder: "Mon, Wed, Fri" },
  { name: "preferred_time", label: "Preferred time" },
  { name: "tracking_method", label: "Tracking method" },
  { name: "status", label: "Status", type: "select", options: ["active", "paused", "archived"] },
  { name: "start_date", label: "Start", type: "date" },
  { name: "end_date", label: "End", type: "date" },
  { name: "responsible_id", label: "Responsible", type: "entity", lookup: "people" },
  { name: "notes", label: "Notes", type: "textarea", full: true },
]

// --- the registry -----------------------------------------------------------
export const REGISTRY: Record<string, EntityDef> = {
  area: { key: "area", label: "Area", crud: areas, fields: AREA_FIELDS, title: (e) => e.name, entityType: "area", extra: AreaExtra },
  project: { key: "project", label: "Project", crud: projects, fields: PROJECT_FIELDS, title: (e) => e.name, entityType: "project", extra: ProjectExtra },
  goal: { key: "goal", label: "Goal", crud: goals, fields: GOAL_FIELDS, title: (e) => e.name, entityType: "goal", extra: GoalExtra },
  metric: { key: "metric", label: "Metric", crud: metrics, fields: METRIC_FIELDS, title: (e) => e.name, entityType: "metric", extra: MetricExtra },
  routine: { key: "routine", label: "Routine", crud: routines, fields: ROUTINE_FIELDS, title: (e) => e.name, entityType: "routine", extra: RoutineExtra },
  program: { key: "program", label: "Program", crud: programs, fields: PROGRAM_FIELDS, title: (e) => e.name, entityType: "program" },
  task: { key: "task", label: "Task", crud: tasks, fields: TASK_FIELDS, title: (e) => e.title, entityType: "task" },
  delegation: { key: "delegation", label: "Delegation", crud: delegations, fields: DELEGATION_FIELDS, title: (e) => e.requested_outcome, entityType: "delegation" },
  review: { key: "review", label: "Review", crud: reviews, fields: REVIEW_FIELDS, title: (e) => `${e.review_type} review`, entityType: "review" },
  organization: { key: "organization", label: "Organization", crud: organizations, fields: ORGANIZATION_FIELDS, title: (e) => e.name, entityType: "organization", extra: OrganizationExtra },
  location: { key: "location", label: "Location", crud: locations, fields: LOCATION_FIELDS, title: (e) => e.name, entityType: "location" },
  protocol: { key: "protocol", label: "Protocol", crud: protocols, fields: PROTOCOL_FIELDS, title: (e) => e.name, entityType: "protocol", extra: ProtocolExtra },
  note: { key: "note", label: "Note", crud: notes, fields: NOTE_FIELDS, title: (e) => e.title || "(untitled)", entityType: "note" },
  event: { key: "event", label: "Event", crud: events, fields: EVENT_FIELDS, title: (e) => e.title, entityType: "event" },
  commitment: { key: "commitment", label: "Commitment", crud: commitments, fields: COMMITMENT_FIELDS, title: (e) => e.description, entityType: "commitment" },
  waitingItem: { key: "waitingItem", label: "Waiting item", crud: waitingItems, fields: WAITING_FIELDS, title: (e) => e.expected_result, entityType: "waiting_item" },
  decision: { key: "decision", label: "Decision", crud: decisions, fields: DECISION_FIELDS, title: (e) => e.question, entityType: "decision" },
  resource: { key: "resource", label: "Resource", crud: resources, fields: RESOURCE_FIELDS, title: (e) => e.title, entityType: "resource" },
  tag: { key: "tag", label: "Tag", crud: tags, fields: TAG_FIELDS, title: (e) => e.name },
  condition: { key: "condition", label: "Condition", crud: conditions, fields: CONDITION_FIELDS, title: (e) => e.name, entityType: "condition" },
  medication: { key: "medication", label: "Medication", crud: medications, fields: MEDICATION_FIELDS, title: (e) => e.name, entityType: "medication" },
  healthEvent: { key: "healthEvent", label: "Health event", crud: healthEvents, fields: HEALTH_EVENT_FIELDS, title: (e) => e.title, entityType: "health_event" },
  insurancePlan: { key: "insurancePlan", label: "Insurance plan", crud: insurancePlans, fields: INSURANCE_FIELDS, title: (e) => e.name, entityType: "insurance_plan" },
  allergy: { key: "allergy", label: "Allergy", crud: allergies, fields: ALLERGY_FIELDS, title: (e) => e.substance, entityType: "allergy" },
}
