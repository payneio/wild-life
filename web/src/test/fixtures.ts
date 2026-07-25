import type { CalendarDay, Instant, WallTime } from "@/lib/date"
import type { Decision, Entity, Location, Resource, Tag, Task } from "@/services/api/types"

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
  context: "@errands",
  recurrence: null,
  blocked_by_task_id: null,
  waiting_on: null,
  acceptance_required: false,
  completed_at: null,
  claimed_by_id: null,
  claimed_at: null,
}

export const TAG: Tag = {
  ...BASE,
  name: "deep-work",
  color: "#4f46e5",
}

export const RESOURCE: Resource = {
  ...BASE,
  title: "Passport renewal form DS-82",
  url: "https://travel.state.gov/ds82",
  resource_type: "document",
  description: "Mail-in renewal, needs a 2x2 photo",
  tags: ["admin", "travel"],
  entity_type: null,
  entity_id: null,
}

export const LOCATION: Location = {
  ...BASE,
  name: "Seattle passport agency",
  category: "venue",
  address: "915 2nd Ave",
  city: "Seattle",
  region: "WA",
  notes: "Appointment only",
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

/** Keyed by `EntityDef.key`. Every def carrying a `detail` needs an entry. */
export const FIXTURES: Record<string, Entity> = {
  task: TASK,
  tag: TAG,
  resource: RESOURCE,
  location: LOCATION,
  decision: DECISION,
}
