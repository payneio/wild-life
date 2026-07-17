import type { Priority } from "@/services/api/types"

export function humanize(value: string | null | undefined): string {
  if (!value) return ""
  return value.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase())
}

/** Local-time `YYYY-MM-DD` for a date (default: now). Local, NOT UTC — using
 *  toISOString() here would roll over to tomorrow every evening west of UTC. */
export function ymd(d: Date = new Date()): string {
  const p = (n: number) => String(n).padStart(2, "0")
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`
}

export function todayISO(): string {
  return ymd()
}

/** The LOCAL calendar day of a date-or-datetime string. A bare date
 *  ("2026-07-16") is taken as-is; a timestamp is converted to the local day —
 *  an event at 8pm Pacific belongs to that local day, not the next UTC day. */
export function localDay(s: string): string {
  return s.length > 10 ? ymd(new Date(s)) : s.slice(0, 10)
}

export function isOverdue(date: string | null | undefined): boolean {
  if (!date) return false
  return localDay(date) < todayISO()
}

export function isToday(date: string | null | undefined): boolean {
  return !!date && localDay(date) === todayISO()
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
/** A friendly header for a day: "Today" | "Yesterday" | "Mon, Jul 14". */
export function dayLabel(dateStr: string | null | undefined): string {
  if (!dateStr) return "Undated"
  const iso = localDay(dateStr)
  const today = todayISO()
  if (iso === today) return "Today"
  const d = new Date(`${today}T00:00:00`)
  d.setDate(d.getDate() - 1)
  const p = (n: number) => String(n).padStart(2, "0")
  const yesterday = `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`
  if (iso === yesterday) return "Yesterday"
  return new Date(`${iso}T00:00:00`).toLocaleDateString(undefined, {
    weekday: "short",
    month: "short",
    day: "numeric",
    year: iso.slice(0, 4) === today.slice(0, 4) ? undefined : "numeric",
  })
}

/** Bucket notes into day groups (by entry_date, falling back to created_at),
 * preserving the incoming (newest-first) order. */
export function groupNotesByDay<
  T extends { entry_date: string | null; created_at: string },
>(notes: T[]): { key: string; label: string; notes: T[] }[] {
  const groups: { key: string; label: string; notes: T[] }[] = []
  const byKey = new Map<string, { key: string; label: string; notes: T[] }>()
  for (const n of notes) {
    const stamp = n.entry_date ?? n.created_at
    const key = localDay(stamp)
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
