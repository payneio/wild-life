// Types mirroring personal-api schemas (source of truth: personal-api/src/personal_api/schemas).

export type ID = string

export interface Entity {
  id: ID
  created_at: string
  updated_at: string
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
  | "commitment"
  | "waiting_item"
  | "delegation"
  | "review"
  | "resource"
  | "decision"

// --- entities ---
export interface Area extends Entity {
  name: string
  description: string | null
  status: AreaStatus
  desired_standard: string | null
  review_frequency: string | null
  accountable_owner_id: ID | null
  notes: string | null
  archived_at: string | null
}

export interface Program extends Entity {
  name: string
  description: string | null
  area_id: ID | null
  intended_outcome: string | null
  success_criteria: string | null
  status: ProgramStatus
  start_date: string | null
  target_date: string | null
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
  start_date: string | null
  target_date: string | null
  accountable_owner_id: ID | null
  responsible_lead_id: ID | null
  next_action: string | null
  last_activity_date: string | null
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
  due_date: string | null
  scheduled_date: string | null
  estimated_minutes: number | null
  context: string | null
  recurrence: string | null
  blocked_by_task_id: ID | null
  waiting_on: string | null
  acceptance_required: boolean
  notes: string | null
  completed_at: string | null
}

export interface Person extends Entity {
  name: string
  relationship: string | null
  organization: string | null
  role: string | null
  emails: string[]
  phones: string[]
  preferred_contact: string | null
  notes: string | null
}

export interface Interaction extends Entity {
  person_id: ID
  occurred_at: string
  kind: string
  summary: string | null
}

export interface Routine extends Entity {
  name: string
  area_id: ID | null
  program_id: ID | null
  frequency: string | null
  preferred_days: string[]
  preferred_time: string | null
  tracking_method: string | null
  start_date: string | null
  end_date: string | null
  responsible_id: ID | null
  status: RoutineStatus
  notes: string | null
}

export interface RoutineInstance extends Entity {
  routine_id: ID
  scheduled_date: string
  status: string
  completed_at: string | null
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
  target_date: string | null
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
  entry_date: string
  value: number
  notes: string | null
}

export interface EventItem extends Entity {
  title: string
  description: string | null
  location: string | null
  start_at: string
  end_at: string | null
  all_day: boolean
  attendees: string[]
  area_id: ID | null
  program_id: ID | null
  project_id: ID | null
  external_ref: string | null
  notes: string | null
}

export interface Note extends Entity {
  title: string | null
  body: string
  note_type: string
  entry_date: string | null
  mood: string | null
  tags: string[]
  entity_type: EntityType | null
  entity_id: ID | null
}

export interface Commitment extends Entity {
  description: string
  owner_id: ID | null
  beneficiary_id: ID | null
  responsible_id: ID | null
  date_made: string | null
  due_date: string | null
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
  date_requested: string | null
  expected_date: string | null
  follow_up_date: string | null
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
  date_delegated: string | null
  instructions: string | null
  priority: Priority
  expected_completion_date: string | null
  follow_up_date: string | null
  acceptance_required: boolean
  status: DelegationStatus
  latest_update: string | null
  last_contact_date: string | null
  delivered_date: string | null
  accepted_date: string | null
  completion_evidence: string | null
  escalation_level: number
  notes: string | null
}

export interface Review extends Entity {
  review_type: ReviewType
  period_start: string | null
  period_end: string | null
  entities_reviewed: string[]
  observations: string | null
  decisions: string | null
  risks: string | null
  follow_up_actions: string | null
  completed_at: string | null
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
  decided_on: string | null
  review_date: string | null
  entity_type: EntityType | null
  entity_id: ID | null
}

export interface Tag extends Entity {
  name: string
  color: string | null
}

// --- review dashboard ---
export interface DashRow {
  id: string
  [key: string]: unknown
}
export interface ReviewDashboard {
  generated_for: string
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
