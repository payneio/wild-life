import type { CalendarDay, Instant, WallTime } from "@/lib/date"
import type {
  Area,
  Commitment,
  Decision,
  Entity,
  Location,
  Organization,
  Program,
  Request,
  Resource,
  Review,
  Tag,
  Task,
} from "@/services/api/types"

/**
 * A complete row per converted entity, for the coverage suite.
 *
 * Each is annotated with its generated type, so the compiler rejects the fixture
 * the moment the API grows a required field — which is what keeps the coverage
 * assertion honest. A fixture that silently fell behind the schema would assert
 * completeness against a shape that no longer exists.
 */

const BASE = {
  id: "11111111-1111-1111-1111-111111111111",
  created_at: "2026-07-01T10:00:00Z" as Instant,
  updated_at: "2026-07-02T10:00:00Z" as Instant,
}

export const TASK: Task = {
  ...BASE,
  title: "Renew the passport",
  description: "Photos, form DS-82, cheque",
  status: "planned",
  priority: "high",
  area_id: null,
  program_id: null,
  project_id: null,
  accountable_owner_id: null,
  responsible_id: null,
  assignee_id: null,
  due_date: "2026-08-01" as CalendarDay,
  scheduled_date: "2026-07-28" as CalendarDay,
  scheduled_time: "09:30" as WallTime,
  estimated_minutes: 45,
  context: "@errands",
  recurrence: null,
  blocked_by_task_id: null,
  waiting_on: null,
  acceptance_required: false,
  completed_at: null,
  claimed_by_id: null,
  claimed_at: null,
}

export const TAG: Tag = {
  ...BASE,
  name: "deep-work",
  color: "#4f46e5",
}

export const RESOURCE: Resource = {
  ...BASE,
  title: "Passport renewal form DS-82",
  url: "https://travel.state.gov/ds82",
  resource_type: "document",
  description: "Mail-in renewal, needs a 2x2 photo",
  tags: ["admin", "travel"],
  entity_type: null,
  entity_id: null,
}

export const LOCATION: Location = {
  ...BASE,
  name: "Seattle passport agency",
  category: "venue",
  address: "915 2nd Ave",
  city: "Seattle",
  region: "WA",
  notes: "Appointment only",
}

export const DECISION: Decision = {
  ...BASE,
  question: "Renew by mail or in person?",
  options_considered: "Mail-in DS-82; in-person appointment",
  decision: "Mail-in",
  rationale: "No travel booked inside eight weeks",
  assumptions: "Processing stays under six weeks",
  owner_id: null,
  decided_on: "2026-07-20" as CalendarDay,
  review_date: null,
  entity_type: null,
  entity_id: null,
}

export const AREA: Area = {
  ...BASE,
  name: "Health",
  description: "Body and mind upkeep",
  status: "active",
  desired_standard: "Sleep 7h, move daily",
  review_frequency: "weekly",
  accountable_owner_id: null,
  responsible_lead_id: null,
  archived_at: null,
}

export const PROGRAM: Program = {
  ...BASE,
  name: "Home admin",
  description: "Recurring household paperwork",
  area_id: null,
  intended_outcome: "Nothing lapses",
  success_criteria: "No late fees",
  status: "active",
  start_date: "2026-01-01" as CalendarDay,
  target_date: null,
  accountable_owner_id: null,
  responsible_lead_id: null,
  review_frequency: "monthly",
  reporting_cadence: null,
}

export const COMMITMENT: Commitment = {
  ...BASE,
  description: "Send the signed lease back",
  status: "open",
  owner_id: null,
  responsible_id: null,
  beneficiary_id: null,
  date_made: "2026-07-10" as CalendarDay,
  due_date: "2026-07-30" as CalendarDay,
  acceptance_status: null,
  evidence: null,
  entity_type: null,
  entity_id: null,
}

export const REQUEST: Request = {
  ...BASE,
  subject: "Need the updated floor plan",
  kind: "deliverable",
  status: "open",
  body: "The one with the revised kitchen wall",
  requester_id: null,
  addressee_id: null,
  external_label: null,
  needed_by: "2026-08-05" as CalendarDay,
  follow_up_date: null,
  resolved_at: null,
  next_action: "Chase by email",
  last_communication: null,
  resolution: null,
  entity_type: null,
  entity_id: null,
}

export const REVIEW: Review = {
  ...BASE,
  review_type: "weekly",
  period_start: "2026-07-13" as CalendarDay,
  period_end: "2026-07-19" as CalendarDay,
  completed_at: null,
  observations: "Inbox stayed under control",
  decisions: null,
  risks: null,
  follow_up_actions: null,
  entities_reviewed: [],
}

export const ORGANIZATION: Organization = {
  ...BASE,
  name: "Northwest Dental",
  org_type: "vendor",
  status: "active",
  industry: "Healthcare",
  description: null,
  website: "https://example.com",
  email: null,
  phone: "206-555-0101",
  address: "100 Pine St",
  notes: null,
}

/** Keyed by `EntityDef.key`. Every def carrying a `detail` needs an entry. */
export const FIXTURES: Record<string, Entity> = {
  task: TASK,
  tag: TAG,
  resource: RESOURCE,
  location: LOCATION,
  decision: DECISION,
  area: AREA,
  program: PROGRAM,
  commitment: COMMITMENT,
  request: REQUEST,
  review: REVIEW,
  organization: ORGANIZATION,
}
