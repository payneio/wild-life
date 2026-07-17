// Types mirroring personal-api schemas (source of truth: personal-api/src/personal_api/schemas).

import type { CalendarDay, Instant, WallTime } from "@/lib/date"

export type ID = string

export interface Entity {
  id: ID
  created_at: Instant
  updated_at: Instant
}

// --- enums ---
export type Priority = "low" | "medium" | "high" | "urgent"
export type AreaStatus = "active" | "inactive" | "archived"
export type ProgramStatus = "proposed" | "active" | "paused" | "completed" | "cancelled"
export type ProjectStatus =
  | "proposed"
  | "active"
  | "waiting"
  | "paused"
  | "completed"
  | "cancelled"
  | "archived"
export type TaskStatus =
  | "inbox"
  | "planned"
  | "in_progress"
  | "waiting"
  | "delegated"
  | "delivered"
  | "completed"
  | "cancelled"
export type RoutineStatus = "active" | "paused" | "archived"
export type GoalStatus = "active" | "achieved" | "paused" | "dropped"
export type CommitmentStatus =
  | "open"
  | "in_progress"
  | "waiting"
  | "fulfilled"
  | "broken"
  | "cancelled"
export type WaitingStatus = "open" | "received" | "overdue" | "cancelled"
export type DelegationStatus =
  | "draft"
  | "requested"
  | "accepted"
  | "in_progress"
  | "waiting_for_update"
  | "blocked"
  | "delivered"
  | "revision_requested"
  | "accepted_as_complete"
  | "declined"
  | "reassigned"
  | "cancelled"
export type ReviewType =
  | "daily"
  | "weekly"
  | "monthly"
  | "quarterly"
  | "area"
  | "program"
  | "project"
  | "delegation"
export type EntityType =
  | "area"
  | "program"
  | "project"
  | "task"
  | "routine"
  | "goal"
  | "metric"
  | "event"
  | "note"
  | "person"
  | "organization"
  | "location"
  | "commitment"
  | "waiting_item"
  | "delegation"
  | "review"
  | "resource"
  | "decision"
  | "condition"
  | "medication"
  | "protocol"
  | "protocol_item"
  | "health_event"
  | "insurance_plan"
  | "allergy"

// --- health enums ---
export type ConditionCategory =
  | "gastrointestinal"
  | "cardiovascular"
  | "dermatologic"
  | "musculoskeletal"
  | "urologic"
  | "auditory"
  | "mental_health"
  | "other"
export type ConditionStatus =
  | "active"
  | "monitoring"
  | "chronic"
  | "resolved"
  | "ruled_out"
export type MedType = "prescription" | "otc" | "supplement"
export type MedStatus =
  | "active"
  | "discontinued"
  | "as_needed"
  | "planned"
  | "completed"
export type ProtocolStatus =
  | "planned"
  | "active"
  | "paused"
  | "completed"
  | "abandoned"
export type HealthEventType =
  | "appointment"
  | "lab"
  | "procedure"
  | "surgery"
  | "imaging"
  | "test"
  | "vaccination"
  | "injury"
  | "symptom"
  | "note"
export type PlanType = "medical" | "dental" | "vision" | "pharmacy"
export type AllergyType = "medication" | "food" | "environmental" | "other"
export type AllergySeverity = "mild" | "moderate" | "severe" | "unknown"
export type AllergyStatus = "active" | "suspected" | "resolved"

// --- entities ---
export interface Area extends Entity {
  name: string
  description: string | null
  status: AreaStatus
  desired_standard: string | null
  review_frequency: string | null
  accountable_owner_id: ID | null
  notes: string | null
  archived_at: Instant | null
}

export interface Program extends Entity {
  name: string
  description: string | null
  area_id: ID | null
  intended_outcome: string | null
  success_criteria: string | null
  status: ProgramStatus
  start_date: CalendarDay | null
  target_date: CalendarDay | null
  accountable_owner_id: ID | null
  responsible_lead_id: ID | null
  review_frequency: string | null
  reporting_cadence: string | null
  notes: string | null
}

export interface Project extends Entity {
  name: string
  description: string | null
  area_id: ID | null
  program_id: ID | null
  intended_outcome: string | null
  completion_criteria: string | null
  status: ProjectStatus
  priority: Priority
  start_date: CalendarDay | null
  target_date: CalendarDay | null
  accountable_owner_id: ID | null
  responsible_lead_id: ID | null
  next_action: string | null
  last_activity_date: CalendarDay | null
  notes: string | null
}

export interface Task extends Entity {
  title: string
  description: string | null
  status: TaskStatus
  area_id: ID | null
  program_id: ID | null
  project_id: ID | null
  priority: Priority
  accountable_owner_id: ID | null
  responsible_id: ID | null
  assignee_id: ID | null
  due_date: CalendarDay | null
  scheduled_date: CalendarDay | null
  scheduled_time: WallTime | null
  estimated_minutes: number | null
  context: string | null
  recurrence: string | null
  blocked_by_task_id: ID | null
  waiting_on: string | null
  acceptance_required: boolean
  notes: string | null
  completed_at: Instant | null
}

export interface ContactMethod {
  value: string
  label: string | null
}

export interface ImportantDate {
  label: string | null
  date: CalendarDay
}

export interface Person extends Entity {
  name: string
  nickname: string | null
  relationship: string | null
  role: string | null
  job_title: string | null
  specialty: string | null
  patient_id: string | null
  portal_url: string | null
  phones: ContactMethod[]
  emails: ContactMethod[]
  addresses: ContactMethod[]
  websites: string[]
  preferred_contact: string | null
  birthday: CalendarDay | null
  important_dates: ImportantDate[]
  photo_url: string | null
  notes: string | null
}

export interface Interaction extends Entity {
  person_id: ID
  occurred_at: Instant
  kind: string
  summary: string | null
}

export interface Organization extends Entity {
  name: string
  org_type: string | null
  industry: string | null
  website: string | null
  email: string | null
  phone: string | null
  address: string | null
  description: string | null
  status: string
  notes: string | null
}

export interface Location extends Entity {
  name: string
  category: string | null
  address: string | null
  city: string | null
  region: string | null
  notes: string | null
}

export interface Affiliation extends Entity {
  person_id: ID
  organization_id: ID
  role: string | null
  is_primary: boolean
  start_date: CalendarDay | null
  end_date: CalendarDay | null
}

export interface Routine extends Entity {
  name: string
  area_id: ID | null
  program_id: ID | null
  frequency: string | null
  preferred_days: string[]
  preferred_time: WallTime | null
  tracking_method: string | null
  start_date: CalendarDay | null
  end_date: CalendarDay | null
  responsible_id: ID | null
  status: RoutineStatus
  notes: string | null
}

export interface RoutineInstance extends Entity {
  routine_id: ID
  scheduled_date: CalendarDay
  status: string
  completed_at: Instant | null
  notes: string | null
}

export interface Goal extends Entity {
  name: string
  description: string | null
  area_id: ID | null
  program_id: ID | null
  metric_id: ID | null
  target_state: string | null
  target_value: number | null
  baseline: number | null
  target_date: CalendarDay | null
  status: GoalStatus
  progress: number | null
  measurement_method: string | null
  notes: string | null
}

export interface ComputedProgress {
  manual: number | null
  from_projects: number | null
  linked_projects: number
  completed_projects: number
  latest_metric_value: number | null
  from_metric: number | null
  metric_baseline: number | null
  metric_target: number | null
  metric_direction: "up" | "down" | null
  metric_met: boolean | null
  overall: number | null
}

export interface Metric extends Entity {
  name: string
  area_id: ID | null
  program_id: ID | null
  unit: string | null
  target_value: number | null
  target_min: number | null
  target_max: number | null
  measurement_frequency: string | null
  data_source: string | null
  notes: string | null
}

export interface MetricEntry extends Entity {
  metric_id: ID
  entry_date: CalendarDay
  value: number
  notes: string | null
}

export interface EventItem extends Entity {
  title: string
  description: string | null
  location: string | null
  start_at: Instant
  end_at: Instant | null
  all_day: boolean
  attendees: string[]
  recurrence: string | null
  recurrence_exdates: Instant[]
  area_id: ID | null
  program_id: ID | null
  project_id: ID | null
  external_ref: string | null
  notes: string | null
  organizer: string | null
  sequence: number | null
  rsvp_status: string | null
  rsvp_sent_status: string | null
}

export interface NoteLink {
  target_type: EntityType
  target_id: ID
}

export interface Note extends Entity {
  title: string | null
  body: string
  note_type: string
  entry_date: CalendarDay | null
  mood: string | null
  tags: string[]
  entity_type: EntityType | null
  entity_id: ID | null
  links: NoteLink[]
}

export interface NoteImage extends Entity {
  note_id: ID
  filename: string | null
  content_type: string | null
  sort_order: number
}

export interface Commitment extends Entity {
  description: string
  owner_id: ID | null
  beneficiary_id: ID | null
  responsible_id: ID | null
  date_made: CalendarDay | null
  due_date: CalendarDay | null
  status: CommitmentStatus
  evidence: string | null
  acceptance_status: string | null
  entity_type: EntityType | null
  entity_id: ID | null
  notes: string | null
}

export interface WaitingItem extends Entity {
  expected_result: string
  person_id: ID | null
  from_org: string | null
  entity_type: EntityType | null
  entity_id: ID | null
  date_requested: CalendarDay | null
  expected_date: CalendarDay | null
  follow_up_date: CalendarDay | null
  status: WaitingStatus
  last_communication: string | null
  next_action: string | null
  notes: string | null
}

export interface Delegation extends Entity {
  requested_outcome: string
  entity_type: EntityType | null
  entity_id: ID | null
  delegator_id: ID | null
  responsible_id: ID | null
  accountable_owner_id: ID | null
  date_delegated: CalendarDay | null
  instructions: string | null
  priority: Priority
  expected_completion_date: CalendarDay | null
  follow_up_date: CalendarDay | null
  acceptance_required: boolean
  status: DelegationStatus
  latest_update: string | null
  last_contact_date: CalendarDay | null
  delivered_date: CalendarDay | null
  accepted_date: CalendarDay | null
  completion_evidence: string | null
  escalation_level: number
  notes: string | null
}

export interface Review extends Entity {
  review_type: ReviewType
  period_start: CalendarDay | null
  period_end: CalendarDay | null
  entities_reviewed: string[]
  observations: string | null
  decisions: string | null
  risks: string | null
  follow_up_actions: string | null
  completed_at: Instant | null
  notes: string | null
}

export interface Resource extends Entity {
  title: string
  resource_type: string | null
  url: string | null
  description: string | null
  tags: string[]
  entity_type: EntityType | null
  entity_id: ID | null
}

export interface Decision extends Entity {
  question: string
  options_considered: string | null
  decision: string | null
  rationale: string | null
  assumptions: string | null
  owner_id: ID | null
  decided_on: CalendarDay | null
  review_date: CalendarDay | null
  entity_type: EntityType | null
  entity_id: ID | null
}

export interface Tag extends Entity {
  name: string
  color: string | null
}

// --- health domain ---
export interface Condition extends Entity {
  name: string
  category: ConditionCategory | null
  status: ConditionStatus
  area_id: ID | null
  program_id: ID | null
  severity: string | null
  onset_date: CalendarDay | null
  resolved_date: CalendarDay | null
  diagnosed_by_id: ID | null
  description: string | null
  notes: string | null
}

export interface DoseSlot {
  slot: string
  amount: string | null
}

export interface Medication extends Entity {
  name: string
  brand: string | null
  generic_name: string | null
  med_type: MedType
  form: string | null
  strength: string | null
  dose: string | null
  schedule: DoseSlot[]
  reason: string | null
  condition_id: ID | null
  prescriber_id: ID | null
  pharmacy_id: ID | null
  status: MedStatus
  start_date: CalendarDay | null
  end_date: CalendarDay | null
  instructions: string | null
  notes: string | null
}

export interface MedicationDose extends Entity {
  medication_id: ID
  dose_date: CalendarDay
  slot: string
  taken_at: Instant | null
}

export interface Protocol extends Entity {
  name: string
  category: string | null
  intended_outcome: string | null
  status: ProtocolStatus
  area_id: ID | null
  program_id: ID | null
  start_date: CalendarDay | null
  end_date: CalendarDay | null
  duration: string | null
  condition_id: ID | null
  provider_id: ID | null
  notes: string | null
}

export interface ProtocolItem extends Entity {
  protocol_id: ID
  medication_id: ID | null
  substance: string | null
  amount: string | null
  timing: string[]
  frequency: string | null
  trigger: string | null
  sort_order: number
  notes: string | null
}

export interface HealthEvent extends Entity {
  occurred_on: CalendarDay
  event_type: HealthEventType
  title: string
  provider_id: ID | null
  organization_id: ID | null
  condition_id: ID | null
  summary: string | null
  findings: string | null
  recommendations: string | null
  follow_up: string | null
  follow_up_date: CalendarDay | null
  location: string | null
  external_ref: string | null
  notes: string | null
}

export interface InsurancePlan extends Entity {
  name: string
  plan_type: PlanType | null
  organization_id: ID | null
  network: string | null
  member_id: string | null
  group_number: string | null
  rx_bin: string | null
  rx_pcn: string | null
  rx_group: string | null
  phone: string | null
  status: string
  notes: string | null
}

export interface Allergy extends Entity {
  substance: string
  allergy_type: AllergyType | null
  reaction: string | null
  severity: AllergySeverity | null
  status: AllergyStatus
  noted_on: CalendarDay | null
  notes: string | null
}

// --- review dashboard ---
export interface DashRow {
  id: string
  [key: string]: unknown
}
export interface ReviewDashboard {
  generated_for: CalendarDay
  overdue_tasks: DashRow[]
  due_today: DashRow[]
  stale_projects: DashRow[]
  projects_missing_next_action: DashRow[]
  unclear_ownership: DashRow[]
  inactive_programs: DashRow[]
  neglected_areas: DashRow[]
  overdue_delegations: DashRow[]
  delegation_followups: DashRow[]
  unreviewed_deliverables: DashRow[]
  waiting_followups: DashRow[]
}
