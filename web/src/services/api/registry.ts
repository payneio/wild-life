import type { ComponentType } from "react"
import type { FieldSpec } from "@/components/EntityForm"
import {
  AreaExtra,
  MetricExtra,
  OrganizationExtra,
  ProtocolExtra,
} from "@/components/detailExtras"
import {
  GoalDetail,
  ProgramDetail,
  ProjectDetail,
  RoutineDetail,
  TaskDetail,
} from "@/components/detail/planning"
import { DelegationDetail, WaitingDetail } from "@/components/detail/followup"
import {
  AllergyDetail,
  ConditionDetail,
  HealthEventDetail,
  InsuranceDetail,
  MedicationDetail,
} from "@/components/detail/health"
import {
  CommitmentDetail,
  DecisionDetail,
  EventDetail,
  LocationDetail,
  ResourceDetail,
  ReviewDetail,
  TagDetail,
} from "@/components/detail/reference"
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
  /** Fields the `extra` already renders — hidden from the generic facts grid. */
  detailHide?: string[]
}

import {
  ALLERGY_FIELDS,
  AREA_FIELDS,
  COMMITMENT_FIELDS,
  CONDITION_FIELDS,
  DECISION_FIELDS,
  DELEGATION_FIELDS,
  EVENT_FIELDS,
  GOAL_FIELDS,
  HEALTH_EVENT_FIELDS,
  INSURANCE_FIELDS,
  LOCATION_FIELDS,
  MEDICATION_FIELDS,
  METRIC_FIELDS,
  NOTE_FIELDS,
  ORGANIZATION_FIELDS,
  PROGRAM_FIELDS,
  PROJECT_FIELDS,
  PROTOCOL_FIELDS,
  RESOURCE_FIELDS,
  REVIEW_FIELDS,
  ROUTINE_FIELDS,
  TAG_FIELDS,
  TASK_FIELDS,
  WAITING_FIELDS,
} from "@/services/api/fields"

export const REGISTRY: Record<string, EntityDef> = {
  area: { key: "area", label: "Area", crud: areas, fields: AREA_FIELDS, title: (e) => e.name, entityType: "area", extra: AreaExtra },
  project: { key: "project", label: "Project", crud: projects, fields: PROJECT_FIELDS, title: (e) => e.name, entityType: "project", extra: ProjectDetail, detailHide: ["next_action"] },
  goal: { key: "goal", label: "Goal", crud: goals, fields: GOAL_FIELDS, title: (e) => e.name, entityType: "goal", extra: GoalDetail, detailHide: ["progress"] },
  metric: { key: "metric", label: "Metric", crud: metrics, fields: METRIC_FIELDS, title: (e) => e.name, entityType: "metric", extra: MetricExtra },
  routine: { key: "routine", label: "Routine", crud: routines, fields: ROUTINE_FIELDS, title: (e) => e.name, entityType: "routine", extra: RoutineDetail },
  program: { key: "program", label: "Program", crud: programs, fields: PROGRAM_FIELDS, title: (e) => e.name, entityType: "program", extra: ProgramDetail },
  task: { key: "task", label: "Task", crud: tasks, fields: TASK_FIELDS, title: (e) => e.title, entityType: "task", extra: TaskDetail, detailHide: ["status", "priority", "scheduled_date", "due_date"] },
  delegation: { key: "delegation", label: "Delegation", crud: delegations, fields: DELEGATION_FIELDS, title: (e) => e.requested_outcome, entityType: "delegation", extra: DelegationDetail, detailHide: ["status", "priority", "date_delegated", "expected_completion_date", "follow_up_date", "escalation_level"] },
  review: { key: "review", label: "Review", crud: reviews, fields: REVIEW_FIELDS, title: (e) => `${e.review_type} review`, entityType: "review", extra: ReviewDetail, detailHide: ["completed_at", "period_start", "period_end"] },
  organization: { key: "organization", label: "Organization", crud: organizations, fields: ORGANIZATION_FIELDS, title: (e) => e.name, entityType: "organization", extra: OrganizationExtra },
  location: { key: "location", label: "Location", crud: locations, fields: LOCATION_FIELDS, title: (e) => e.name, entityType: "location", extra: LocationDetail, detailHide: ["address", "city", "region"] },
  protocol: { key: "protocol", label: "Protocol", crud: protocols, fields: PROTOCOL_FIELDS, title: (e) => e.name, entityType: "protocol", extra: ProtocolExtra },
  note: { key: "note", label: "Note", crud: notes, fields: NOTE_FIELDS, title: (e) => e.title || "(untitled)", entityType: "note" },
  event: { key: "event", label: "Event", crud: events, fields: EVENT_FIELDS, title: (e) => e.title, entityType: "event", extra: EventDetail, detailHide: ["start_at", "end_at", "all_day"] },
  commitment: { key: "commitment", label: "Commitment", crud: commitments, fields: COMMITMENT_FIELDS, title: (e) => e.description, entityType: "commitment", extra: CommitmentDetail, detailHide: ["status", "date_made", "due_date"] },
  waitingItem: { key: "waitingItem", label: "Waiting item", crud: waitingItems, fields: WAITING_FIELDS, title: (e) => e.expected_result, entityType: "waiting_item", extra: WaitingDetail, detailHide: ["status", "date_requested", "expected_date", "follow_up_date"] },
  decision: { key: "decision", label: "Decision", crud: decisions, fields: DECISION_FIELDS, title: (e) => e.question, entityType: "decision", extra: DecisionDetail, detailHide: ["decision"] },
  resource: { key: "resource", label: "Resource", crud: resources, fields: RESOURCE_FIELDS, title: (e) => e.title, entityType: "resource", extra: ResourceDetail, detailHide: ["url"] },
  tag: { key: "tag", label: "Tag", crud: tags, fields: TAG_FIELDS, title: (e) => e.name, extra: TagDetail, detailHide: ["color"] },
  condition: { key: "condition", label: "Condition", crud: conditions, fields: CONDITION_FIELDS, title: (e) => e.name, entityType: "condition", extra: ConditionDetail },
  medication: { key: "medication", label: "Medication", crud: medications, fields: MEDICATION_FIELDS, title: (e) => e.name, entityType: "medication", extra: MedicationDetail, detailHide: ["strength", "dose"] },
  healthEvent: { key: "healthEvent", label: "Health event", crud: healthEvents, fields: HEALTH_EVENT_FIELDS, title: (e) => e.title, entityType: "health_event", extra: HealthEventDetail, detailHide: ["follow_up", "follow_up_date"] },
  insurancePlan: { key: "insurancePlan", label: "Insurance plan", crud: insurancePlans, fields: INSURANCE_FIELDS, title: (e) => e.name, entityType: "insurance_plan", extra: InsuranceDetail, detailHide: ["member_id", "group_number", "rx_bin", "rx_pcn", "rx_group", "network", "phone"] },
  allergy: { key: "allergy", label: "Allergy", crud: allergies, fields: ALLERGY_FIELDS, title: (e) => e.substance, entityType: "allergy", extra: AllergyDetail, detailHide: ["severity", "reaction"] },
}
