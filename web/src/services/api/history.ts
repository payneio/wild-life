// Change-history API. Kept self-contained (not in types.ts/hooks.ts) to stay
// out of the way of concurrent edits to those shared modules.
import { useQuery } from "@tanstack/react-query"
import { apiClient } from "@/services/api/client"

export type ChangeAction = "insert" | "update" | "delete"

/** One recorded change from the audit log (source: change_log). */
export interface ChangeLog {
  id: string
  entity_type: string // source table name, e.g. "tasks"
  entity_id: string | null
  entity_label: string | null
  action: ChangeAction
  // update -> { field: { old, new } }; insert/delete -> { field: value }
  changes: Record<string, unknown>
  created_at: string
}

/** Most-recent-first change feed. */
export function useHistory(limit = 200) {
  return useQuery({
    queryKey: ["history", limit],
    queryFn: () =>
      apiClient.get<ChangeLog[]>("/history", { limit: String(limit) }),
  })
}
