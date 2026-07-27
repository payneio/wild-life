import type { CalendarDay, Instant, WallTime } from "@/lib/date"
import type {
  Allergy,
  Area,
  Commitment,
  Decision,
  Delegation,
  Entity,
  EventItem,
  Outcome,
  InsurancePlan,
  Location,
  Medication,
  Metric,
  Note,
  Organization,
  Program,
  Project,
  Protocol,
  Request,
  Resource,
  Review,
  Routine,
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
  intended_outcome: "A body that keeps up with what I ask of it",
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
  status: "active",
  start_date: "2026-01-01" as CalendarDay,
  ended_date: null,
  category: null,
  involves: [],
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

export const MEDICATION: Medication = {
  ...BASE,
  name: "Ibuprofen",
  brand: "Advil",
  med_type: "otc",
  program_id: null,
  prescriber_id: null,
  pharmacy_id: null,
  reason: "Inflammation",
  instructions: "With food",
  notes: null,
}

export const ALLERGY: Allergy = {
  ...BASE,
  substance: "Penicillin",
  allergy_type: "medication",
  severity: "severe",
  status: "active",
  reaction: "Hives, swelling",
  noted_on: "2019-03-11" as CalendarDay,
  notes: null,
}

export const INSURANCE_PLAN: InsurancePlan = {
  ...BASE,
  name: "Premera Blue Cross PPO",
  plan_type: "medical",
  status: "active",
  organization_id: null,
  network: "PPO",
  member_id: "ABC123456",
  group_number: "1000042",
  rx_bin: "003858",
  rx_pcn: "A4",
  rx_group: "RX7890",
  phone: "800-555-0100",
  notes: null,
}

export const PROTOCOL: Protocol = {
  ...BASE,
  name: "Heel rehab",
  category: "physio",
  intended_outcome: "Pain-free walking",
  paused: false,
  program_id: null,
  start_date: "2026-06-01" as CalendarDay,
  end_date: null,
  duration: "8 weeks",
  provider_id: null,
  notes: null,
}

export const METRIC: Metric = {
  ...BASE,
  name: "Resting heart rate",
  source: "manual",
  derivation: null,
  entity_type: "area",
  entity_id: "00000000-0000-4000-8000-000000000002",
  unit: "bpm",
  reference_min: null,
  reference_max: 65,
  measurement_frequency: "daily",
  data_source: "Watch",
  notes: null,
}

export const PROJECT: Project = {
  ...BASE,
  name: "Kitchen remodel",
  description: "Cabinets, counters, lighting",
  area_id: null,
  program_id: null,
  intended_outcome: "A kitchen we want to cook in",
  status: "active",
  priority: "high",
  start_date: "2026-06-01" as CalendarDay,
  target_date: "2026-10-01" as CalendarDay,
  accountable_owner_id: null,
  responsible_lead_id: null,
  next_action: "Confirm the cabinet order",
  last_activity_date: "2026-07-20" as CalendarDay,
}

export const OUTCOME: Outcome = {
  ...BASE,
  statement: "Run a half marathon",
  kind: "target",
  description: null,
  entity_type: "area",
  entity_id: "00000000-0000-4000-8000-000000000001",
  status: "active",
  metric_id: null,
  target_min: 21,
  target_max: null,
  baseline: 5,
  by_when: "2026-11-01" as CalendarDay,
  satisfied_at: null,
}

export const ROUTINE: Routine = {
  ...BASE,
  name: null,
  activity: "Heel stretches",
  status: "active",
  area_id: null,
  program_id: null,
  // Non-nullable: every routine is a step of some protocol.
  protocol_id: "22222222-2222-2222-2222-222222222222",
  medication_id: null,
  responsible_id: null,
  amount: null,
  unit: null,
  timing: ["morning", "evening"],
  days_of_week: [],
  preferred_days: [],
  preferred_time: null,
  frequency: "daily",
  interval_days: 1,
  start_date: "2026-06-01" as CalendarDay,
  end_date: null,
  tracking_method: null,
  sort_order: 0,
  notes: null,
}

export const DELEGATION: Delegation = {
  ...BASE,
  requested_outcome: "Draft the vendor comparison",
  status: "requested",
  priority: "medium",
  delegator_id: null,
  responsible_id: null,
  accountable_owner_id: null,
  date_delegated: "2026-07-15" as CalendarDay,
  accepted_date: null,
  expected_completion_date: "2026-08-01" as CalendarDay,
  delivered_date: null,
  follow_up_date: null,
  last_contact_date: null,
  acceptance_required: true,
  escalation_level: 0,
  instructions: "Three vendors, total cost of ownership",
  latest_update: null,
  completion_evidence: null,
  entity_type: null,
  entity_id: null,
}

export const NOTE: Note = {
  ...BASE,
  title: "Contractor call",
  body: "Walked through the cabinet options.",
  note_type: "meeting",
  entry_date: "2026-07-21" as CalendarDay,
  mood: null,
  tags: ["remodel"],
  links: [],
  entity_type: null,
  entity_id: null,
}

export const EVENT: EventItem = {
  ...BASE,
  title: "Cabinet install",
  event_type: "appointment",
  description: null,
  location: "Home",
  start_at: "2026-08-10T16:00:00Z" as Instant,
  end_at: "2026-08-10T19:00:00Z" as Instant,
  all_day: false,
  attendees: [],
  recurrence: null,
  recurrence_exdates: [],
  recurrence_id: null,
  recurrence_parent_id: null,
  entity_type: null,
  entity_id: null,
  external_ref: null,
  organizer: null,
  sequence: null,
  rsvp_status: null,
  rsvp_sent_status: null,
  invites_enabled: false,
  cancelled_at: null,
  received_invite: false,
}

/** Shapes of one object whose layout is conditional, so coverage can check all
 *  of them. An Outcome renders different fields per kind — a standard has no
 *  deadline to miss and a deliverable has no band to sit in — so no single row
 *  can exercise the whole layout. */
export const VARIANTS: Record<string, Entity[]> = {
  // A derived metric has no entry box and no cadence to be nagged about, so its
  // layout differs from a hand-logged one.
  metric: [
    METRIC,
    {
      ...METRIC,
      name: "Tasks shipped per week",
      source: "derived",
      derivation: "task_throughput",
      unit: "tasks/week",
      measurement_frequency: null,
    } satisfies Metric,
  ],
  // A condition is a program, so a program has a clinical shape too — the
  // Clinical section only renders once the program says it is one.
  program: [
    PROGRAM,
    {
      ...PROGRAM,
      category: "gastrointestinal",
      involves: ["medication", "protocol"],
    } satisfies Program,
  ],
  outcome: ([
    OUTCOME,
    { ...OUTCOME, kind: "standard", baseline: null, by_when: null },
    {
      ...OUTCOME,
      kind: "deliverable",
      statement: "Final inspection signed off",
      metric_id: null,
      target_min: null,
      target_max: null,
      baseline: null,
      by_when: null,
      satisfied_at: null,
    },
  ] satisfies Outcome[]),
}

/** Keyed by `EntityDef.key`. Every def carrying a `detail` needs an entry. */
export const FIXTURES: Record<string, Entity> = {
  project: PROJECT,
  outcome: OUTCOME,
  routine: ROUTINE,
  delegation: DELEGATION,
  note: NOTE,
  event: EVENT,
  medication: MEDICATION,
  allergy: ALLERGY,
  insurancePlan: INSURANCE_PLAN,
  protocol: PROTOCOL,
  metric: METRIC,
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
