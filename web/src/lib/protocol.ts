import { today } from "@/lib/date"
import type { Protocol, ProtocolState } from "@/services/api/types"

/**
 * A protocol's lifecycle is derived from its window; `paused` is the only stored
 * bit. planned (start in the future) · active (in-window) · completed (past end).
 */
export function protocolState(p: Protocol): ProtocolState {
  if (p.paused) return "paused"
  const t = today()
  if (p.start_date && p.start_date > t) return "planned"
  if (p.end_date && p.end_date < t) return "completed"
  return "active"
}
