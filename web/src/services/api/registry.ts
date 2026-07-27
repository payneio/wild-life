import type { ComponentType } from "react"
import type { FieldSpec } from "@/services/api/fieldSpec"
import { TaskDetail as TaskRecord } from "@/entities/task/Detail"
import { TagDetail as TagRecord } from "@/entities/tag/Detail"
import { ResourceDetail as ResourceRecord } from "@/entities/resource/Detail"
import { LocationDetail as LocationRecord } from "@/entities/location/Detail"
import { DecisionDetail as DecisionRecord } from "@/entities/decision/Detail"
import { AreaDetail as AreaRecord } from "@/entities/area/Detail"
import { ProgramDetail as ProgramRecord } from "@/entities/program/Detail"
import { CommitmentDetail as CommitmentRecord } from "@/entities/commitment/Detail"
import { RequestDetail as RequestRecord } from "@/entities/request/Detail"
import { ReviewDetail as ReviewRecord } from "@/entities/review/Detail"
import { OrganizationDetail as OrganizationRecord } from "@/entities/organization/Detail"
import { MedicationDetail as MedicationRecord } from "@/entities/medication/Detail"
import { AllergyDetail as AllergyRecord } from "@/entities/allergy/Detail"
import { InsurancePlanDetail as InsurancePlanRecord } from "@/entities/insurancePlan/Detail"
import { ProtocolDetail as ProtocolRecord } from "@/entities/protocol/Detail"
import { MetricDetail as MetricRecord } from "@/entities/metric/Detail"
import { ProjectDetail as ProjectRecord } from "@/entities/project/Detail"
import { OutcomeRecord } from "@/entities/outcome/Detail"
import { RoutineDetail as RoutineRecord } from "@/entities/routine/Detail"
import { DelegationDetail as DelegationRecord } from "@/entities/delegation/Detail"
import { NoteDetail as NoteRecord } from "@/entities/note/Detail"
import { EventDetail as EventRecord } from "@/entities/event/Detail"
import type { createCrud } from "@/services/api/crud"
import type { Entity, EntityType } from "@/services/api/types"
import {
  allergies,
  areas,
  commitments,
  decisions,
  delegations,
  events,
  outcomes,
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
 * Many-to-many joins (person↔org) stay in bespoke `extra`s that
 * carry their own link/unlink hooks.
 */
export type RelationSpec =
  | {
      mode: "fk-children"
      label: string
      type: EntityType
      fkField: string
      inherit?: string[]
      hideWhenEmpty?: boolean
    }
  | {
      mode: "soft-backref"
      label: string
      type: EntityType
      hideWhenEmpty?: boolean
      /** Fields quick-create should prefill beyond the root link — the gesture
       *  already knows them. An Area's outcome is a standard, a Project's is a
       *  deliverable; asking would be asking something already answered. */
      defaults?: Record<string, unknown>
    }

/** Panels an object can opt into via `involves`, rather than always showing.
 *  Empty ⇒ nothing to offer, so no control appears. */
export function optionalPanels(def: EntityDef): RelationSpec[] {
  return (def.relations ?? []).filter((r) => "hideWhenEmpty" in r && r.hideWhenEmpty)
}

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
  /** The entity's detail layout, composed from the `Record` primitives. It owns
   *  the whole surface — there is no generic field-grid renderer to coordinate
   *  with, which is what made a field render twice. `fields` below is now only
   *  the *create* form and the list filter/sort config. */
  detail: ComponentType<{ entity: Entity; onClose: () => void; onDelete?: () => void }>
  /** Related collections rendered as generic add/link/create panels. */
  relations?: RelationSpec[]
  /** If set, the detail shows a polymorphic "primary context" picker (writes the
   *  entity_type/entity_id soft-poly pair) under this label — e.g. "Rooted to"
   *  for notes, "About" for events. */
  contextLabel?: string
  /**
   * The muted subtitle a type-scoped picker shows beside each row.
   *
   * In a picker restricted to one type the right-hand slot printed the type name
   * on every row — the same word 22 times, saying nothing. What actually
   * disambiguates differs by object: a parent for hierarchical ones, a date for
   * temporal ones, an affiliation for people. `resolve` is the shared entity
   * index (`useEntityResolver`), because a row carries `area_id`, not "Health".
   */
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  context?: (e: any, resolve: (type: EntityType, id: string) => string | undefined) => string | undefined
}

import {
  ALLERGY_FIELDS,
  AREA_FIELDS,
  COMMITMENT_FIELDS,
  DECISION_FIELDS,
  DELEGATION_FIELDS,
  EVENT_FIELDS,
  OUTCOME_FIELDS,
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
  area: { key: "area", label: "Area", crud: areas, fields: AREA_FIELDS, title: (e) => e.name, entityType: "area", titleField: "name", quickCreate: true, detail: AreaRecord, relations: [
    { mode: "fk-children", label: "Programs", type: "program", fkField: "area_id" },
    { mode: "fk-children", label: "Projects", type: "project", fkField: "area_id" },
    { mode: "soft-backref", label: "Outcomes", type: "outcome", defaults: { kind: "standard" } },
    { mode: "fk-children", label: "Routines", type: "routine", fkField: "area_id" },
    { mode: "fk-children", label: "Metrics", type: "metric", fkField: "area_id" },
    { mode: "soft-backref", label: "Events", type: "event", hideWhenEmpty: true },
    { mode: "soft-backref", label: "Notes", type: "note" },
  ] },
  project: { key: "project", label: "Project", crud: projects, fields: PROJECT_FIELDS, title: (e) => e.name, context: (e, r) => (e.program_id && r("program", e.program_id)) || (e.area_id && r("area", e.area_id)) || undefined, entityType: "project", titleField: "name", quickCreate: true, detail: ProjectRecord, relations: [
    { mode: "soft-backref", label: "Events", type: "event", hideWhenEmpty: true },
    { mode: "soft-backref", label: "Notes", type: "note" },
    { mode: "soft-backref", label: "Resources", type: "resource" },
    { mode: "soft-backref", label: "Decisions", type: "decision" },
    { mode: "soft-backref", label: "Done when", type: "outcome", defaults: { kind: "deliverable" } },
  ] },
  outcome: { key: "outcome", label: "Outcome", crud: outcomes, fields: OUTCOME_FIELDS, title: (e) => e.statement, context: (e, r) => (e.entity_type && e.entity_id && r(e.entity_type, e.entity_id)) || undefined, entityType: "outcome", titleField: "statement", quickCreate: true, detail: OutcomeRecord, relations: [
    { mode: "soft-backref", label: "Notes", type: "note" },
  ] },
  metric: { key: "metric", label: "Metric", crud: metrics, fields: METRIC_FIELDS, title: (e) => e.name, context: (e, r) => (e.area_id && r("area", e.area_id)) || undefined, entityType: "metric", titleField: "name", quickCreate: true, detail: MetricRecord, relations: [
    { mode: "fk-children", label: "Outcomes measured by this", type: "outcome", fkField: "metric_id" },
  ] },
  routine: { key: "routine", label: "Routine", crud: routines, fields: ROUTINE_FIELDS, title: (e) => e.activity ?? e.name ?? "Routine", context: (e, r) => (e.protocol_id && r("protocol", e.protocol_id)) || (e.area_id && r("area", e.area_id)) || undefined, entityType: "routine", titleField: "activity", quickCreate: true, detail: RoutineRecord },
  program: { key: "program", label: "Program", crud: programs, fields: PROGRAM_FIELDS, title: (e) => e.name, context: (e, r) => (e.area_id && r("area", e.area_id)) || undefined, entityType: "program", titleField: "name", quickCreate: true, detail: ProgramRecord, relations: [
    { mode: "fk-children", label: "Projects", type: "project", fkField: "program_id", inherit: ["area_id"] },
    { mode: "soft-backref", label: "Metrics", type: "metric" },
    { mode: "soft-backref", label: "Outcomes", type: "outcome", defaults: { kind: "target" } },
    // A condition is a program, so the clinical panels live here. They stay out
    // of the way on the programs that have nothing to do with them — see
    // `involves` on RelatedPanel.
    { mode: "fk-children", label: "Medications", type: "medication", fkField: "program_id", hideWhenEmpty: true },
    { mode: "fk-children", label: "Protocols", type: "protocol", fkField: "program_id", hideWhenEmpty: true },
    { mode: "soft-backref", label: "Events", type: "event", hideWhenEmpty: true },
    { mode: "soft-backref", label: "Notes", type: "note" },
  ] },
  task: { key: "task", label: "Task", crud: tasks, fields: TASK_FIELDS, title: (e) => e.title, context: (e, r) => (e.project_id && r("project", e.project_id)) || (e.area_id && r("area", e.area_id)) || undefined, entityType: "task", titleField: "title", quickCreate: true, detail: TaskRecord, relations: [
    { mode: "soft-backref", label: "Notes", type: "note", hideWhenEmpty: true },
  ] },
  delegation: { key: "delegation", label: "Delegation", crud: delegations, fields: DELEGATION_FIELDS, title: (e) => e.requested_outcome, entityType: "delegation", titleField: "requested_outcome", quickCreate: true, detail: DelegationRecord, relations: [
    { mode: "soft-backref", label: "Notes", type: "note", hideWhenEmpty: true },
  ] },
  review: { key: "review", label: "Review", crud: reviews, fields: REVIEW_FIELDS, title: (e) => `${e.review_type} review`, entityType: "review", titleField: "review_type", detail: ReviewRecord, relations: [
    { mode: "soft-backref", label: "Notes", type: "note", hideWhenEmpty: true },
  ] },
  organization: { key: "organization", label: "Organization", crud: organizations, fields: ORGANIZATION_FIELDS, title: (e) => e.name, context: (e) => e.org_type ?? undefined, entityType: "organization", titleField: "name", quickCreate: true, detail: OrganizationRecord, relations: [
    { mode: "fk-children", label: "Insurance plans", type: "insurance_plan", fkField: "organization_id" },
  ] },
  location: { key: "location", label: "Location", crud: locations, fields: LOCATION_FIELDS, title: (e) => e.name, context: (e) => e.city ?? undefined, entityType: "location", titleField: "name", quickCreate: true, detail: LocationRecord },
  protocol: { key: "protocol", label: "Protocol", crud: protocols, fields: PROTOCOL_FIELDS, title: (e) => e.name, entityType: "protocol", titleField: "name", quickCreate: true, detail: ProtocolRecord },
  note: { key: "note", label: "Note", crud: notes, fields: NOTE_FIELDS, title: (e) => e.title || "(untitled)", entityType: "note", titleField: "title", detail: NoteRecord },
  event: { key: "event", label: "Event", crud: events, fields: EVENT_FIELDS, title: (e) => e.title, entityType: "event", titleField: "title", detail: EventRecord, relations: [
    { mode: "soft-backref", label: "Notes", type: "note" },
  ] },
  commitment: { key: "commitment", label: "Commitment", crud: commitments, fields: COMMITMENT_FIELDS, title: (e) => e.description, entityType: "commitment", titleField: "description", quickCreate: true, detail: CommitmentRecord, relations: [
    { mode: "soft-backref", label: "Notes", type: "note", hideWhenEmpty: true },
  ] },
  request: { key: "request", label: "Request", crud: requests, fields: REQUEST_FIELDS, title: (e) => e.subject, entityType: "request", titleField: "subject", quickCreate: true, detail: RequestRecord, relations: [
    { mode: "soft-backref", label: "Notes", type: "note", hideWhenEmpty: true },
  ] },
  decision: { key: "decision", label: "Decision", crud: decisions, fields: DECISION_FIELDS, title: (e) => e.question, entityType: "decision", titleField: "question", quickCreate: true, detail: DecisionRecord, relations: [
    { mode: "soft-backref", label: "Notes", type: "note", hideWhenEmpty: true },
  ] },
  resource: { key: "resource", label: "Resource", crud: resources, fields: RESOURCE_FIELDS, title: (e) => e.title, context: (e) => e.resource_type ?? undefined, entityType: "resource", titleField: "title", quickCreate: true, detail: ResourceRecord },
  tag: { key: "tag", label: "Tag", crud: tags, fields: TAG_FIELDS, title: (e) => e.name, titleField: "name", quickCreate: true, detail: TagRecord },
  medication: { key: "medication", label: "Medication", crud: medications, fields: MEDICATION_FIELDS, title: (e) => e.name, context: (e, r) => e.brand ?? ((e.program_id && r("program", e.program_id)) || undefined), entityType: "medication", titleField: "name", quickCreate: true, detail: MedicationRecord },
  insurancePlan: { key: "insurancePlan", label: "Insurance plan", crud: insurancePlans, fields: INSURANCE_FIELDS, title: (e) => e.name, entityType: "insurance_plan", titleField: "name", quickCreate: true, detail: InsurancePlanRecord },
  allergy: { key: "allergy", label: "Allergy", crud: allergies, fields: ALLERGY_FIELDS, title: (e) => e.substance, entityType: "allergy", titleField: "substance", quickCreate: true, detail: AllergyRecord },
}

/** Registry keyed by `entityType` — used to resolve a relation's target def
 *  (crud, title, route) when rendering generic related-collection panels. */
export const REGISTRY_BY_TYPE: Partial<Record<EntityType, EntityDef>> = Object.fromEntries(
  Object.values(REGISTRY)
    .filter((d) => d.entityType)
    .map((d) => [d.entityType, d]),
)

/** `crud.resource` → `EntityType`, so a generic list page can find its own
 *  lifecycle without every caller restating it. Built lazily (never at
 *  module-eval time) for the same import-cycle reason as `mentionSources`. */
let _typeByResource: Record<string, EntityType> | null = null
export function entityTypeForResource(resource: string): EntityType | undefined {
  if (!_typeByResource) {
    _typeByResource = Object.fromEntries(
      Object.values(REGISTRY)
        .filter((d) => d.entityType)
        .map((d) => [d.crud.resource, d.entityType as EntityType]),
    )
  }
  return _typeByResource[resource]
}
