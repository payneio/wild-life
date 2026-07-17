import type { Priority } from "@/services/api/types"
import type { CalendarDay, Instant } from "@/lib/date"
import { asDay, dayLabel } from "@/lib/date"

// Date/time helpers now live in @/lib/date (branded + Temporal-backed). Re-export
// the names existing call sites already use.
export {
  todayISO,
  ymd,
  localDay,
  isOverdue,
  isToday,
  dayLabel,
  formatDay,
  formatInstant,
} from "@/lib/date"

export function humanize(value: string | null | undefined): string {
  if (!value) return ""
  return value.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase())
}

export const PRIORITY_RANK: Record<Priority, number> = {
  urgent: 0,
  high: 1,
  medium: 2,
  low: 3,
}

export const PRIORITY_CLASS: Record<Priority, string> = {
  urgent: "bg-red-100 text-red-700",
  high: "bg-amber-100 text-amber-700",
  medium: "bg-slate-100 text-slate-600",
  low: "bg-slate-100 text-slate-400",
}

// Coarse status coloring by common state families.
export function statusClass(status: string): string {
  const s = status.toLowerCase()
  if (["completed", "fulfilled", "achieved", "accepted_as_complete", "received"].includes(s))
    return "bg-emerald-100 text-emerald-700"
  if (["cancelled", "declined", "broken", "dropped", "archived", "inactive"].includes(s))
    return "bg-slate-100 text-slate-400"
  if (["blocked", "waiting", "waiting_for_update", "paused", "overdue", "revision_requested"].includes(s))
    return "bg-amber-100 text-amber-700"
  if (["in_progress", "active", "delivered", "delegated", "requested", "accepted"].includes(s))
    return "bg-indigo-100 text-indigo-700"
  return "bg-slate-100 text-slate-600"
}

// --- journal day grouping ---------------------------------------------------
/** Bucket notes into day groups (by entry_date, falling back to created_at),
 * preserving the incoming (newest-first) order. */
export function groupNotesByDay<
  T extends { entry_date: CalendarDay | null; created_at: Instant },
>(notes: T[]): { key: string; label: string; notes: T[] }[] {
  const groups: { key: string; label: string; notes: T[] }[] = []
  const byKey = new Map<string, { key: string; label: string; notes: T[] }>()
  for (const n of notes) {
    const stamp = n.entry_date ?? n.created_at
    const key = asDay(stamp)
    let g = byKey.get(key)
    if (!g) {
      g = { key, label: dayLabel(stamp), notes: [] }
      byKey.set(key, g)
      groups.push(g)
    }
    g.notes.push(n)
  }
  return groups
}
