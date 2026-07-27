import type { LookupKey } from "@/services/api/lookups"
import type { EntityType } from "@/services/api/types"

/** The one place that bridges the form/read `LookupKey` vocabulary to the
 *  registry-driven `EntityType` used by search, routing, and quick-create.
 *  Only `people` diverges (→ `person`); the rest are identity. */
export const LOOKUP_TO_TYPE: Record<LookupKey, EntityType> = {
  area: "area",
  program: "program",
  project: "project",
  task: "task",
  people: "person",
  outcome: "outcome",
  metric: "metric",
  organization: "organization",
  medication: "medication",
  protocol: "protocol",
}
