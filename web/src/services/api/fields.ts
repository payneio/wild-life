// Field specs + option lists — a leaf module (no component imports) so pages
// can import these without creating a cycle through registry.ts.
import type { FieldSpec } from "@/services/api/fieldSpec"
import { SLOTS, WEEKDAYS } from "@/lib/slots"

// Option lists come from `enums.ts`, the single runtime source shared with the
// detail layouts and checked against the generated unions.
import {
  ALLERGY_SEVERITY,
  ALLERGY_STATUS,
  ALLERGY_TYPE,
  COMMIT_STATUS,
  HEALTH_CATEGORY,
  DELEGATION_STATUS,
  EVENT_TYPE,
  MEASUREMENT_FREQUENCIES,
  MED_TYPE,
  ORG_STATUS,
  PLAN_TYPE,
  PRIORITIES,
  PROGRAM_STATUS,
  REQUEST_KIND,
  REQUEST_STATUS,
  REVIEW_TYPE,
  TASK_STATUS,
} from "@/services/api/enums"

// --- field specs (shared by list edit-form + detail view) -------------------
export const PROGRAM_FIELDS: FieldSpec[] = [
  { name: "name", label: "Name" },
  { name: "description", label: "Description", type: "textarea", full: true },
  { name: "area_id", label: "Area", type: "entity", lookup: "area" },
  { name: "status", label: "Status", type: "select", options: PROGRAM_STATUS },
  { name: "intended_outcome", label: "Intended outcome", type: "textarea" },
  { name: "success_criteria", label: "Success criteria", type: "textarea" },
  { name: "start_date", label: "Start", type: "date" },
  { name: "ended_date", label: "Ended", type: "date" },
  { name: "category", label: "Health category", type: "select", options: HEALTH_CATEGORY },
  { name: "review_frequency", label: "Review frequency" },
  { name: "reporting_cadence", label: "Reporting cadence" },
]

export const EVENT_FIELDS: FieldSpec[] = [
  { name: "title", label: "Title", full: true },
  { name: "event_type", label: "Type", type: "select", options: EVENT_TYPE },
  { name: "description", label: "Description", type: "textarea", full: true },
  { name: "start_at", label: "Start", type: "datetime" },
  { name: "end_at", label: "End", type: "datetime" },
  { name: "all_day", label: "All day", type: "checkbox" },
  { name: "location", label: "Location" },
  { name: "attendees", label: "Attendees", type: "attendees", full: true },
  { name: "recurrence", label: "Repeats", type: "recurrence", full: true },
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
]

export const REQUEST_FIELDS: FieldSpec[] = [
  { name: "subject", label: "Subject", full: true },
  { name: "body", label: "Details", type: "textarea", full: true },
  { name: "kind", label: "Kind", type: "select", options: REQUEST_KIND },
  { name: "requester_id", label: "From", type: "entity", lookup: "people" },
  { name: "addressee_id", label: "To", type: "entity", lookup: "people" },
  { name: "external_label", label: "To (external)" },
  { name: "status", label: "Status", type: "select", options: REQUEST_STATUS },
  { name: "needed_by", label: "Needed by", type: "date" },
  { name: "follow_up_date", label: "Follow up", type: "date" },
  { name: "resolution", label: "Resolution", type: "textarea" },
  { name: "next_action", label: "Next action" },
  { name: "last_communication", label: "Last contact", type: "textarea" },
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
  { name: "scheduled_time", label: "Time", type: "time" },
  { name: "due_date", label: "Due", type: "date" },
  { name: "estimated_minutes", label: "Estimate (min)", type: "number" },
  { name: "context", label: "Context", placeholder: "@home, @calls" },
  { name: "recurrence", label: "Recurrence", placeholder: "daily / weekly / monthly" },
  { name: "waiting_on", label: "Waiting on" },
  { name: "acceptance_required", label: "Requires acceptance", type: "checkbox" },
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

export const MEDICATION_FIELDS: FieldSpec[] = [
  { name: "name", label: "Name" },
  { name: "brand", label: "Brand" },
  { name: "med_type", label: "Type", type: "select", options: MED_TYPE },
  { name: "prescriber_id", label: "Prescriber", type: "entity", lookup: "people" },
  { name: "pharmacy_id", label: "Pharmacy", type: "entity", lookup: "organization" },
  { name: "reason", label: "Reason", type: "textarea" },
  { name: "instructions", label: "Instructions", type: "textarea" },
  { name: "notes", label: "Notes", type: "textarea", full: true },
]

export const PROTOCOL_FIELDS: FieldSpec[] = [
  { name: "name", label: "Name" },
  { name: "category", label: "Category" },
  { name: "paused", label: "Paused", type: "checkbox" },
  { name: "area_id", label: "Area", type: "entity", lookup: "area" },
  { name: "program_id", label: "Program", type: "entity", lookup: "program" },
  { name: "duration", label: "Duration", placeholder: "4-6 wk" },
  { name: "start_date", label: "Start", type: "date" },
  { name: "end_date", label: "End", type: "date" },
  { name: "provider_id", label: "Provider", type: "entity", lookup: "people" },
  { name: "intended_outcome", label: "Intended outcome", type: "textarea", full: true },
  { name: "notes", label: "Notes", type: "textarea", full: true },
]

// Dose-line (protocol_item) fields, shared by the protocol Steps editor and the
// medication standing-dose editor. Cadence follows FHIR Timing (see api regimen).

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
]

export const PROJECT_FIELDS: FieldSpec[] = [
  { name: "name", label: "Name", full: true },
  { name: "description", label: "Description", type: "textarea", full: true },
  { name: "status", label: "Status", type: "select", options: ["proposed", "active", "waiting", "paused", "completed", "cancelled", "archived"] },
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
]

export const OUTCOME_FIELDS: FieldSpec[] = [
  { name: "statement", label: "Statement", full: true },
  { name: "kind", label: "Kind", type: "select", options: ["standard", "target", "deliverable"] },
  { name: "status", label: "Status", type: "select", options: ["active", "achieved", "paused", "dropped"] },
  { name: "metric_id", label: "Metric", type: "entity", lookup: "metric" },
  { name: "target_min", label: "At least", type: "number" },
  { name: "target_max", label: "At most", type: "number" },
  { name: "baseline", label: "Baseline", type: "number" },
  { name: "by_when", label: "By when", type: "date" },
  { name: "description", label: "Description", type: "textarea", full: true },
]

export const METRIC_FIELDS: FieldSpec[] = [
  { name: "name", label: "Name" },
  { name: "unit", label: "Unit" },
  { name: "area_id", label: "Area", type: "entity", lookup: "area" },
  { name: "reference_min", label: "Normal from", type: "number" },
  { name: "reference_max", label: "Normal to", type: "number" },
  { name: "measurement_frequency", label: "Reading cadence", type: "select", options: MEASUREMENT_FREQUENCIES },
  { name: "data_source", label: "Data source" },
  { name: "notes", label: "Notes", type: "textarea", full: true },
]

export const ROUTINE_FIELDS: FieldSpec[] = [
  { name: "activity", label: "Routine", full: true, placeholder: "e.g. Walk after dinner" },
  { name: "timing", label: "Times of day", type: "multiselect", options: SLOTS, full: true },
  { name: "days_of_week", label: "Days (blank = every day)", type: "multiselect", options: WEEKDAYS, full: true },
  { name: "interval_days", label: "Every N days", type: "number", placeholder: "1" },
  { name: "area_id", label: "Area", type: "entity", lookup: "area" },
  { name: "responsible_id", label: "Responsible", type: "entity", lookup: "people" },
  { name: "status", label: "Status", type: "select", options: ["active", "paused", "archived"] },
  { name: "start_date", label: "Start", type: "date" },
  { name: "end_date", label: "End", type: "date" },
  { name: "notes", label: "Notes", type: "textarea", full: true },
]

// --- the registry -----------------------------------------------------------
