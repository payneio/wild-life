import type { CalendarDay, Instant, WallTime } from "@/lib/date"
import type {
  Allergy,
  Area,
  Commitment,
  Decision,
  Delegation,
  Entity,
  Outcome,
  InsurancePlan,
  Location,
  Medication,
  Metric,
  MetricGroup,
  Moment,
  Organization,
  Program,
  Project,
  Protocol,
  Request,
  Resource,
  Review,
  Routine,
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
  // Rank among siblings — set by the API, never left unset.
  position: 1024,
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
  recurrence: null,
  blocked_by_task_id: null,
  waiting_on: null,
  acceptance_required: false,
  completed_at: null,
  claimed_by_id: null,
  claimed_at: null,
}


export const RESOURCE: Resource = {
  ...BASE,
  title: "Passport renewal form DS-82",
  url: "https://travel.state.gov/ds82",
  resource_type: "document",
  description: "Mail-in renewal, needs a 2x2 photo",
  entity_type: null,
  entity_id: null,
}

export const LOCATION: Location = {
  ...BASE,
  name: "Seattle passport agency",
  category: "venue",
  street: "915 2nd Ave",
  unit: null,
  city: "Seattle",
  region: "WA",
  postcode: "98104",
  country: "United States",
  description: "Appointment only",
  latitude: 47.6042,
  longitude: -122.3327,
  radius_m: 120,
  geo_dirty_at: null,
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
  purpose: "Body and mind upkeep",
  status: "active",
  review_frequency: "weekly",
  accountable_owner_id: null,
  responsible_lead_id: null,
  archived_at: null,
}

export const PROGRAM: Program = {
  ...BASE,
  name: "Home admin",
  purpose: "Recurring household paperwork",
  area_id: null,
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
  street: "100 Pine St",
  unit: "Floor 3",
  city: "Seattle",
  region: "WA",
  postcode: "98101",
  country: "United States",
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
  adjustments: null,
}

export const ALLERGY: Allergy = {
  ...BASE,
  substance: "Penicillin",
  allergy_type: "medication",
  severity: "severe",
  status: "active",
  reaction: "Hives, swelling",
  noted_on: "2019-03-11" as CalendarDay,
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
}

export const PROTOCOL: Protocol = {
  ...BASE,
  name: "Heel rehab",
  category: "physio",
  purpose: "Pain-free walking",
  paused: false,
  program_id: null,
  start_date: "2026-06-01" as CalendarDay,
  end_date: null,
  duration: "8 weeks",
  provider_id: null,
  adjustments: null,
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
  scale: null,
  numerator_metric_id: null,
  denominator_metric_id: null,
}

export const METRIC_GROUP: MetricGroup = {
  ...BASE,
  name: "Lipid panel",
  entity_type: "program",
  entity_id: "00000000-0000-0000-0000-0000000000aa",
  description: "Cholesterol and triglycerides, drawn together.",
}

export const PROJECT: Project = {
  ...BASE,
  name: "Kitchen remodel",
  purpose: "Cabinets, counters, lighting",
  // Non-null in the schema — a project without a program cannot exist.
  program_id: "22222222-2222-2222-2222-222222222222",
  status: "active",
  priority: "high",
  start_date: "2026-06-01" as CalendarDay,
  target_date: "2026-10-01" as CalendarDay,
  accountable_owner_id: null,
  responsible_lead_id: null,
  next_action: "Confirm the cabinet order",
  last_activity_date: "2026-07-20" as CalendarDay,
  review_frequency: null,
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
  name: "Heel stretches",
  status: "active",
  area_id: null,
  program_id: null,
  // Follows what the rule is *of*: no medication, so it generates activities.
  kind: "activity",
  // Null: this rule has no clock slot, so no zone to hold it in. Only a rule
  // that says when in the day (an occasion) needs one.
  timezone: null,
  expected_minutes: null,
  // The calendar family of the cadence — empty for a striding rule like this.
  months: [],
  day_of_month: null,
  week_of_month: null,
  // Optional since the generalisation — a rule may stand on its own, and a
  // protocol is a container that narrows it rather than what makes it a rule.
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
  rationale: null,
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

export const MOMENT: Moment = {
  ...BASE,
  kind: "observation",
  title: "Contractor call",
  body: "Walked through the cabinet options.",
  started_at: "2026-07-21T12:00:00Z" as Instant,
  ended_at: null,
  all_day: true,
  window_start: null,
  window_end: null,
  expected_minutes: null,
  source: "authored",
  withdrawn_at: null,
  withdrawal_reason: null,
  source_ref: null,
  // Not part of a series: a moment only names a rule when it is that series'
  // anchor, or an occurrence something happened to.
  rule_id: null,
  occurrence_at: null,
  links: [],
}


/** Shapes of one object whose layout is conditional, so coverage can check all
 *  of them. An Outcome renders different fields per kind — a standard has no
 *  deadline to miss and only a target has a baseline — so no single row
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
    // A ratio reads two other metrics, so it renders operand pickers that no
    // other shape does.
    {
      ...METRIC,
      name: "Cholesterol / HDL",
      source: "derived",
      derivation: "ratio",
      unit: null,
      measurement_frequency: null,
      numerator_metric_id: "00000000-0000-0000-0000-0000000000b1",
      denominator_metric_id: "00000000-0000-0000-0000-0000000000b2",
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
      kind: "standard",
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
  moment: MOMENT,
  medication: MEDICATION,
  allergy: ALLERGY,
  insurancePlan: INSURANCE_PLAN,
  protocol: PROTOCOL,
  metric: METRIC,
  metricGroup: METRIC_GROUP,
  task: TASK,
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
