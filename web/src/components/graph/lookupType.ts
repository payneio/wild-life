import type { LookupKey } from "@/services/api/lookups"
import type { EntityType } from "@/services/api/types"

/** The one place that bridges the form/read `LookupKey` vocabulary to the
 *  registry-driven `EntityType` used by search, routing, and quick-create.
 *  Only `people` diverges (→ `person`); the rest are identity. */
export const LOOKUP_TO_TYPE: Record<LookupKey, EntityType> = {
  area: "area",
  program: "program",
  project: "project",
  people: "person",
  goal: "goal",
  metric: "metric",
  organization: "organization",
  location: "location",
  condition: "condition",
  medication: "medication",
  protocol: "protocol",
}
