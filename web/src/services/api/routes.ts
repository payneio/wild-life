import type { EntityType } from "@/services/api/types"

/**
 * Detail-route base for each entity type (matches router/routes.tsx). Kept in
 * its own module — free of any REGISTRY import — so lightweight consumers like
 * EntityRef can map a (type, id) to a link without pulling in the search index
 * (and without forming an import cycle back through the registry).
 */
export const ROUTE_BY_TYPE: Partial<Record<EntityType, string>> = {
  area: "areas",
  program: "programs",
  project: "projects",
  task: "tasks",
  routine: "routines",
  outcome: "outcomes",
  metric: "metrics",
  delegation: "delegations",
  note: "notes",
  event: "events",
  commitment: "commitments",
  request: "requests",
  decision: "decisions",
  resource: "resources",
  person: "people",
  organization: "organizations",
  location: "locations",
  condition: "conditions",
  medication: "medications",
  protocol: "protocols",
  insurance_plan: "insurance",
  allergy: "allergies",
}

/** Detail route path for an entity, or undefined if the type has no detail route. */
export function routeFor(type: EntityType, id: string): string | undefined {
  const base = ROUTE_BY_TYPE[type]
  return base ? `/${base}/${id}` : undefined
}
