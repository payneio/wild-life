import type { ComponentType } from "react"
import type { FieldSpec } from "@/components/EntityForm"
import {
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
import { DelegationDetail, RequestDetail } from "@/components/detail/followup"
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
  requests,
} from "@/services/api/hooks"

type Crud<T extends Entity> = ReturnType<typeof createCrud<T>>

/**
 * A related-collection the detail view renders below the entity's own section.
 * Pure data (no hooks), so it stays in the registry without import cycles:
 *  - `fk-children`  — rows of `type` whose `fkField` points back at this entity
 *    (add = re-parent an existing row or quick-create with the FK + `inherit`ed
 *    context prefilled).
 *  - `soft-backref` — rows of `type` whose polymorphic `entity_type`/`entity_id`
 *    point at this entity.
 * Many-to-many joins (goal↔project, person↔org) stay in bespoke `extra`s that
 * carry their own link/unlink hooks.
 */
export type RelationSpec =
  | { mode: "fk-children"; label: string; type: EntityType; fkField: string; inherit?: string[] }
  | { mode: "soft-backref"; label: string; type: EntityType }

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
  /** The field the entity's display title reads from (e.g. "name" | "title").
   *  Used by inline quick-create to name a new row from the picker query. */
  titleField?: string
  /** Whether this type can be created inline from a picker with just its title
   *  (i.e. its Create schema requires nothing beyond `titleField`). */
  quickCreate?: boolean
  /** Optional rich section shown below the shared field list in the detail view. */
  extra?: ComponentType<{ entity: Entity }>
  /** Fields the `extra` already renders — hidden from the generic facts grid. */
  detailHide?: string[]
  /** Related collections rendered as generic add/link/create panels. */
  relations?: RelationSpec[]
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
  REQUEST_FIELDS,
} from "@/services/api/fields"

export const REGISTRY: Record<string, EntityDef> = {
  area: { key: "area", label: "Area", crud: areas, fields: AREA_FIELDS, title: (e) => e.name, entityType: "area", titleField: "name", quickCreate: true, relations: [
    { mode: "fk-children", label: "Programs", type: "program", fkField: "area_id" },
    { mode: "fk-children", label: "Projects", type: "project", fkField: "area_id" },
    { mode: "fk-children", label: "Goals", type: "goal", fkField: "area_id" },
    { mode: "fk-children", label: "Routines", type: "routine", fkField: "area_id" },
    { mode: "fk-children", label: "Metrics", type: "metric", fkField: "area_id" },
  ] },
  project: { key: "project", label: "Project", crud: projects, fields: PROJECT_FIELDS, title: (e) => e.name, entityType: "project", titleField: "name", quickCreate: true, extra: ProjectDetail, detailHide: ["next_action"], relations: [
    { mode: "fk-children", label: "Events", type: "event", fkField: "project_id", inherit: ["area_id", "program_id"] },
    { mode: "soft-backref", label: "Notes", type: "note" },
    { mode: "soft-backref", label: "Resources", type: "resource" },
    { mode: "soft-backref", label: "Decisions", type: "decision" },
  ] },
  goal: { key: "goal", label: "Goal", crud: goals, fields: GOAL_FIELDS, title: (e) => e.name, entityType: "goal", titleField: "name", quickCreate: true, extra: GoalDetail, detailHide: ["progress"] },
  metric: { key: "metric", label: "Metric", crud: metrics, fields: METRIC_FIELDS, title: (e) => e.name, entityType: "metric", titleField: "name", quickCreate: true, extra: MetricExtra, relations: [
    { mode: "fk-children", label: "Goals measured by this", type: "goal", fkField: "metric_id" },
  ] },
  routine: { key: "routine", label: "Routine", crud: routines, fields: ROUTINE_FIELDS, title: (e) => e.activity ?? e.name ?? "Routine", entityType: "routine", titleField: "activity", quickCreate: true, extra: RoutineDetail },
  program: { key: "program", label: "Program", crud: programs, fields: PROGRAM_FIELDS, title: (e) => e.name, entityType: "program", titleField: "name", quickCreate: true, extra: ProgramDetail, relations: [
    { mode: "fk-children", label: "Projects", type: "project", fkField: "program_id", inherit: ["area_id"] },
    { mode: "fk-children", label: "Metrics", type: "metric", fkField: "program_id", inherit: ["area_id"] },
    { mode: "fk-children", label: "Goals", type: "goal", fkField: "program_id", inherit: ["area_id"] },
  ] },
  task: { key: "task", label: "Task", crud: tasks, fields: TASK_FIELDS, title: (e) => e.title, entityType: "task", titleField: "title", quickCreate: true, extra: TaskDetail, detailHide: ["status", "priority", "scheduled_date", "due_date"] },
  delegation: { key: "delegation", label: "Delegation", crud: delegations, fields: DELEGATION_FIELDS, title: (e) => e.requested_outcome, entityType: "delegation", titleField: "requested_outcome", quickCreate: true, extra: DelegationDetail, detailHide: ["status", "priority", "date_delegated", "expected_completion_date", "follow_up_date", "escalation_level"] },
  review: { key: "review", label: "Review", crud: reviews, fields: REVIEW_FIELDS, title: (e) => `${e.review_type} review`, entityType: "review", titleField: "review_type", extra: ReviewDetail, detailHide: ["completed_at", "period_start", "period_end"] },
  organization: { key: "organization", label: "Organization", crud: organizations, fields: ORGANIZATION_FIELDS, title: (e) => e.name, entityType: "organization", titleField: "name", quickCreate: true, extra: OrganizationExtra, relations: [
    { mode: "fk-children", label: "Insurance plans", type: "insurance_plan", fkField: "organization_id" },
    { mode: "fk-children", label: "Health events", type: "health_event", fkField: "organization_id" },
  ] },
  location: { key: "location", label: "Location", crud: locations, fields: LOCATION_FIELDS, title: (e) => e.name, entityType: "location", titleField: "name", quickCreate: true, extra: LocationDetail, detailHide: ["address", "city", "region"] },
  protocol: { key: "protocol", label: "Protocol", crud: protocols, fields: PROTOCOL_FIELDS, title: (e) => e.name, entityType: "protocol", titleField: "name", quickCreate: true, extra: ProtocolExtra },
  note: { key: "note", label: "Note", crud: notes, fields: NOTE_FIELDS, title: (e) => e.title || "(untitled)", entityType: "note", titleField: "title" },
  event: { key: "event", label: "Event", crud: events, fields: EVENT_FIELDS, title: (e) => e.title, entityType: "event", titleField: "title", extra: EventDetail, detailHide: ["start_at", "end_at", "all_day"] },
  commitment: { key: "commitment", label: "Commitment", crud: commitments, fields: COMMITMENT_FIELDS, title: (e) => e.description, entityType: "commitment", titleField: "description", quickCreate: true, extra: CommitmentDetail, detailHide: ["status", "date_made", "due_date"] },
  request: { key: "request", label: "Request", crud: requests, fields: REQUEST_FIELDS, title: (e) => e.subject, entityType: "request", titleField: "subject", quickCreate: true, extra: RequestDetail, detailHide: ["status", "kind", "needed_by", "follow_up_date", "resolved_at"] },
  decision: { key: "decision", label: "Decision", crud: decisions, fields: DECISION_FIELDS, title: (e) => e.question, entityType: "decision", titleField: "question", quickCreate: true, extra: DecisionDetail, detailHide: ["decision"] },
  resource: { key: "resource", label: "Resource", crud: resources, fields: RESOURCE_FIELDS, title: (e) => e.title, entityType: "resource", titleField: "title", quickCreate: true, extra: ResourceDetail, detailHide: ["url"] },
  tag: { key: "tag", label: "Tag", crud: tags, fields: TAG_FIELDS, title: (e) => e.name, titleField: "name", quickCreate: true, extra: TagDetail, detailHide: ["color"] },
  condition: { key: "condition", label: "Condition", crud: conditions, fields: CONDITION_FIELDS, title: (e) => e.name, entityType: "condition", titleField: "name", quickCreate: true, extra: ConditionDetail, relations: [
    { mode: "fk-children", label: "Medications", type: "medication", fkField: "condition_id" },
    { mode: "fk-children", label: "Protocols", type: "protocol", fkField: "condition_id" },
    { mode: "fk-children", label: "Metrics (labs)", type: "metric", fkField: "condition_id" },
    { mode: "fk-children", label: "Goals", type: "goal", fkField: "condition_id" },
    { mode: "fk-children", label: "Health events", type: "health_event", fkField: "condition_id" },
  ] },
  medication: { key: "medication", label: "Medication", crud: medications, fields: MEDICATION_FIELDS, title: (e) => e.name, entityType: "medication", titleField: "name", quickCreate: true, extra: MedicationDetail },
  healthEvent: { key: "healthEvent", label: "Health event", crud: healthEvents, fields: HEALTH_EVENT_FIELDS, title: (e) => e.title, entityType: "health_event", titleField: "title", extra: HealthEventDetail, detailHide: ["follow_up", "follow_up_date"] },
  insurancePlan: { key: "insurancePlan", label: "Insurance plan", crud: insurancePlans, fields: INSURANCE_FIELDS, title: (e) => e.name, entityType: "insurance_plan", titleField: "name", quickCreate: true, extra: InsuranceDetail, detailHide: ["member_id", "group_number", "rx_bin", "rx_pcn", "rx_group", "network", "phone"] },
  allergy: { key: "allergy", label: "Allergy", crud: allergies, fields: ALLERGY_FIELDS, title: (e) => e.substance, entityType: "allergy", titleField: "substance", quickCreate: true, extra: AllergyDetail, detailHide: ["severity", "reaction"] },
}

/** Registry keyed by `entityType` — used to resolve a relation's target def
 *  (crud, title, route) when rendering generic related-collection panels. */
export const REGISTRY_BY_TYPE: Partial<Record<EntityType, EntityDef>> = Object.fromEntries(
  Object.values(REGISTRY)
    .filter((d) => d.entityType)
    .map((d) => [d.entityType, d]),
)
