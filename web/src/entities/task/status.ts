import type { TaskStatus } from "@/services/api/types"

/**
 * How a task's status is offered: a lane for the four states a task actually
 * walks, plus an overflow for the rest.
 *
 * Split out so the reachability test can assert the two together cover
 * `TaskStatus`. The original defect was a four-step lane with no overflow, which
 * left `cancelled` and `delegated` unsettable from the detail page — a gap
 * nothing could see because the lane was the only list anyone compared against.
 */
export const STEPS: { value: TaskStatus; label: string }[] = [
  { value: "planned", label: "Planned" },
  { value: "in_progress", label: "In progress" },
  { value: "waiting", label: "Waiting" },
  { value: "completed", label: "Done" },
]

export const OFF_LANE: TaskStatus[] = ["inbox", "delegated", "delivered", "cancelled"]
