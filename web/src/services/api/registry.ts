import type { ComponentType } from "react"
import type { FieldSpec } from "@/services/api/fieldSpec"
import { TaskDetail as TaskRecord } from "@/entities/task/Detail"
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
import { MetricGroupDetail as MetricGroupRecord } from "@/entities/metricGroup/Detail"
import { ProjectDetail as ProjectRecord } from "@/entities/project/Detail"
import { OutcomeRecord } from "@/entities/outcome/Detail"
import { RoutineDetail as RoutineRecord } from "@/entities/routine/Detail"
import { DelegationDetail as DelegationRecord } from "@/entities/delegation/Detail"
import { MomentDetail as MomentRecord } from "@/entities/moment/Detail"
import { EventDetail as EventRecord } from "@/entities/event/Detail"
import { EventCapture } from "@/entities/event/Capture"
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
  metricGroups,
  moments,
  organizations,
  programs,
  projects,
  protocols,
  resources,
  reviews,
  routines,
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
      /** List but don't link. For a collection reached *through* something else
       *  — an Area's projects, which belong to its programs — where the rows are
       *  worth seeing in one place but "Add" would have to invent a parent the
       *  panel doesn't own. Filing happens on the rung that owns the link. */
      readOnly?: boolean
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

/**
 * First of `[field, type]` the row actually carries, as a parent ref.
 *
 * Written as pairs rather than a chain of `&&` so the declaration reads as the
 * order of preference it is — tightest rung first — and so a field that stops
 * existing shows up as a `parent` reading `undefined` rather than as a subtitle
 * that silently prints nothing. `registry.test.ts` checks each named field
 * against the fixtures for exactly that reason.
 */
export function refOf(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  row: any,
  ...candidates: [field: string, type: EntityType][]
): { type: EntityType; id: string } | undefined {
  for (const [field, type] of candidates) {
    const id = row?.[field]
    if (typeof id === "string" && id) return { type, id }
  }
  return undefined
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
  /**
   * Which rows of a shared table this object *is*.
   *
   * One table can back several objects — `routines` holds every rule, and a
   * `dose` rule, an `activity` and an `occasion` are not the same thing to a
   * reader. Without this the picker offered 58 synced meeting series as
   * "Routine". Applied wherever the registry lists an object generically (the
   * mention sources, and so the resolver and every picker); a surface that
   * passes its own params is already saying what it wants.
   *
   * Declared here rather than defaulted on the server: a hidden filter on
   * `/routines` would make the endpoint lie about what it holds.
   */
  listParams?: Record<string, string>
  /** An object's own capture surface, for when a title alone can't make one.
   *  A component like `detail`, not a config flag: an event needs a *when*, and
   *  what control that takes is the object's business. Rendered by a related
   *  panel above the list; absent means the generic title-only quick-create in
   *  the picker is enough. */
  capture?: ComponentType<{ root: { type: EntityType; id: string } }>
  /** If set, the detail shows a polymorphic "primary context" picker (writes the
   *  entity_type/entity_id soft-poly pair) under this label — e.g. "Rooted to"
   *  for notes, "About" for events. */
  /**
   * The one object this is filed under — ancestry, declared once.
   *
   * Where the object lives is a fact about the object, not a fact about any
   * particular surface, so it belongs here rather than in each place that wants
   * to show it. Two things read it: the breadcrumb (`useAncestry` walks it
   * upward — a project reaches its area by asking its program, never by keeping
   * a copy) and the picker subtitle below.
   *
   * Return the *link*, not a label. A `{type, id}` can be resolved to a name, a
   * route, or another parent; a string can only be printed.
   */
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  parent?: (e: any) => { type: EntityType; id: string } | undefined
  /**
   * The muted subtitle a type-scoped picker shows beside each row.
   *
   * In a picker restricted to one type the right-hand slot printed the type name
   * on every row — the same word 22 times, saying nothing. What actually
   * disambiguates differs by object: a parent for hierarchical ones, a date for
   * temporal ones, an affiliation for people. `resolve` is the shared entity
   * index (`useEntityResolver`), because a row carries `area_id`, not "Health".
   *
   * Optional where `parent` says it already: an object with a parent falls back
   * to that parent's name, so only objects whose subtitle *isn't* their parent
   * (a medication's brand, an organization's type) declare one — and one that
   * does declare it wins, since it was chosen over the parent on purpose.
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
  METRIC_GROUP_FIELDS,
  MOMENT_FIELDS,
  ORGANIZATION_FIELDS,
  PROGRAM_FIELDS,
  PROJECT_FIELDS,
  PROTOCOL_FIELDS,
  RESOURCE_FIELDS,
  REVIEW_FIELDS,
  ROUTINE_FIELDS,
  TASK_FIELDS,
  REQUEST_FIELDS,
} from "@/services/api/fields"

export const REGISTRY: Record<string, EntityDef> = {
  area: { key: "area", label: "Area", crud: areas, fields: AREA_FIELDS, title: (e) => e.name, entityType: "area", titleField: "name", quickCreate: true, detail: AreaRecord, relations: [
    { mode: "fk-children", label: "Programs", type: "program", fkField: "area_id" },
    // Reached through the programs — `?area_id=` on /projects resolves the join
    // server-side. Read-only because a project is filed into a program, not an
    // area; the Add lives on the Program panel below it.
    { mode: "fk-children", label: "Projects", type: "project", fkField: "area_id", readOnly: true },
    { mode: "soft-backref", label: "Outcomes", type: "outcome", defaults: { kind: "standard" } },
    { mode: "fk-children", label: "Routines", type: "routine", fkField: "area_id" },
    { mode: "soft-backref", label: "Metrics", type: "metric" },
    { mode: "soft-backref", label: "Events", type: "event", hideWhenEmpty: true },
  ] },
  project: { key: "project", label: "Project", crud: projects, fields: PROJECT_FIELDS, title: (e) => e.name, parent: (e) => ({ type: "program", id: e.program_id }), entityType: "project", titleField: "name", quickCreate: true, detail: ProjectRecord, relations: [
    { mode: "soft-backref", label: "Events", type: "event", hideWhenEmpty: true },
    { mode: "soft-backref", label: "Resources", type: "resource" },
    { mode: "soft-backref", label: "Decisions", type: "decision" },
    { mode: "soft-backref", label: "Done when", type: "outcome", defaults: { kind: "deliverable" } },
  ] },
  outcome: { key: "outcome", label: "Outcome", crud: outcomes, fields: OUTCOME_FIELDS, title: (e) => e.statement, parent: (e) => (e.entity_type && e.entity_id ? { type: e.entity_type, id: e.entity_id } : undefined), entityType: "outcome", titleField: "statement", quickCreate: true, detail: OutcomeRecord, relations: [
  ] },
  // Rooted soft-polymorphically, not on an `area_id` — the subtitle used to read
  // one, years after the column moved, and printed nothing on every row.
  metric: { key: "metric", label: "Metric", crud: metrics, fields: METRIC_FIELDS, title: (e) => e.name, parent: (e) => (e.entity_type && e.entity_id ? { type: e.entity_type, id: e.entity_id } : undefined), entityType: "metric", titleField: "name", quickCreate: true, detail: MetricRecord, relations: [
    { mode: "fk-children", label: "Outcomes measured by this", type: "outcome", fkField: "metric_id" },
  ] },
  metricGroup: { key: "metricGroup", label: "Metric group", crud: metricGroups, fields: METRIC_GROUP_FIELDS, title: (e) => e.name, parent: (e) => (e.entity_type && e.entity_id ? { type: e.entity_type, id: e.entity_id } : undefined), entityType: "metric_group", titleField: "name", quickCreate: true, detail: MetricGroupRecord },
  // The rule table also holds `occasion` rules (recurring calendar series), which
  // are not routines to a reader and get their own surface in the calendar step.
  routine: { key: "routine", label: "Routine", crud: routines, listParams: { kind__in: "dose,activity", limit: "200" }, fields: ROUTINE_FIELDS, title: (e) => e.activity ?? e.name ?? "Routine", parent: (e) => refOf(e, ["protocol_id", "protocol"], ["program_id", "program"], ["area_id", "area"]), entityType: "routine", titleField: "activity", quickCreate: true, detail: RoutineRecord },
  program: { key: "program", label: "Program", crud: programs, fields: PROGRAM_FIELDS, title: (e) => e.name, parent: (e) => refOf(e, ["area_id", "area"]), entityType: "program", titleField: "name", quickCreate: true, detail: ProgramRecord, relations: [
    { mode: "fk-children", label: "Projects", type: "project", fkField: "program_id" },
    { mode: "soft-backref", label: "Metrics", type: "metric" },
    { mode: "soft-backref", label: "Outcomes", type: "outcome", defaults: { kind: "target" } },
    // A condition is a program, so the clinical panels live here. They stay out
    // of the way on the programs that have nothing to do with them — see
    // `involves` on RelatedPanel.
    { mode: "fk-children", label: "Medications", type: "medication", fkField: "program_id", hideWhenEmpty: true },
    { mode: "fk-children", label: "Protocols", type: "protocol", fkField: "program_id", hideWhenEmpty: true },
    // No Events panel: a program renders its events as the Timeline band
    // (`detail/planning.tsx`), which earns them a dated rendering the generic
    // list can't give. Declaring both put the same rows on the page twice, and
    // left the only way to record one five panels below the surface they're read
    // on.
  ] },
  // Tightest first, though the API now guarantees only one is ever set.
  task: { key: "task", label: "Task", crud: tasks, fields: TASK_FIELDS, title: (e) => e.title, parent: (e) => refOf(e, ["project_id", "project"], ["program_id", "program"], ["area_id", "area"]), entityType: "task", titleField: "title", quickCreate: true, detail: TaskRecord, relations: [
  ] },
  delegation: { key: "delegation", label: "Delegation", crud: delegations, fields: DELEGATION_FIELDS, title: (e) => e.requested_outcome, entityType: "delegation", titleField: "requested_outcome", quickCreate: true, detail: DelegationRecord, relations: [
  ] },
  review: { key: "review", label: "Review", crud: reviews, fields: REVIEW_FIELDS, title: (e) => `${e.review_type} review`, entityType: "review", titleField: "review_type", detail: ReviewRecord, relations: [
  ] },
  organization: { key: "organization", label: "Organization", crud: organizations, fields: ORGANIZATION_FIELDS, title: (e) => e.name, context: (e) => e.org_type ?? undefined, entityType: "organization", titleField: "name", quickCreate: true, detail: OrganizationRecord, relations: [
    { mode: "fk-children", label: "Insurance plans", type: "insurance_plan", fkField: "organization_id" },
  ] },
  location: { key: "location", label: "Location", crud: locations, fields: LOCATION_FIELDS, title: (e) => e.name, context: (e) => e.city ?? undefined, entityType: "location", titleField: "name", quickCreate: true, detail: LocationRecord },
  protocol: { key: "protocol", label: "Protocol", crud: protocols, fields: PROTOCOL_FIELDS, title: (e) => e.name, parent: (e) => refOf(e, ["program_id", "program"]), entityType: "protocol", titleField: "name", quickCreate: true, detail: ProtocolRecord },
  // The spine. Deliberately has no `parent`: involvement replaces rootedness, so
  // the display parent is *derived* tightest-first from the links rather than
  // read off a privileged column — which is what lets one moment concern the
  // program and the medication both.
  moment: { key: "moment", label: "Moment", crud: moments, fields: MOMENT_FIELDS, title: (e) => e.title || "(untitled)", entityType: "moment", titleField: "title", detail: MomentRecord },
  event: { key: "event", label: "Event", crud: events, fields: EVENT_FIELDS, title: (e) => e.title, entityType: "event", titleField: "title", detail: EventRecord, capture: EventCapture, relations: [
  ] },
  commitment: { key: "commitment", label: "Commitment", crud: commitments, fields: COMMITMENT_FIELDS, title: (e) => e.description, entityType: "commitment", titleField: "description", quickCreate: true, detail: CommitmentRecord, relations: [
  ] },
  request: { key: "request", label: "Request", crud: requests, fields: REQUEST_FIELDS, title: (e) => e.subject, entityType: "request", titleField: "subject", quickCreate: true, detail: RequestRecord, relations: [
  ] },
  decision: { key: "decision", label: "Decision", crud: decisions, fields: DECISION_FIELDS, title: (e) => e.question, entityType: "decision", titleField: "question", quickCreate: true, detail: DecisionRecord, relations: [
  ] },
  resource: { key: "resource", label: "Resource", crud: resources, fields: RESOURCE_FIELDS, title: (e) => e.title, context: (e) => e.resource_type ?? undefined, entityType: "resource", titleField: "title", quickCreate: true, detail: ResourceRecord },
  // Brand beats program in the picker — two rows named "ibuprofen" are told
  // apart by the box they came in — so it keeps a `context` of its own.
  medication: { key: "medication", label: "Medication", crud: medications, fields: MEDICATION_FIELDS, title: (e) => e.name, context: (e) => e.brand ?? undefined, parent: (e) => refOf(e, ["program_id", "program"]), entityType: "medication", titleField: "name", quickCreate: true, detail: MedicationRecord },
  insurancePlan: { key: "insurancePlan", label: "Insurance plan", crud: insurancePlans, fields: INSURANCE_FIELDS, title: (e) => e.name, parent: (e) => refOf(e, ["organization_id", "organization"]), entityType: "insurance_plan", titleField: "name", quickCreate: true, detail: InsurancePlanRecord },
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
