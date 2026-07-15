import type { Priority } from "@/services/api/types"

export function humanize(value: string | null | undefined): string {
  if (!value) return ""
  return value.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase())
}

export function todayISO(): string {
  return new Date().toISOString().slice(0, 10)
}

export function isOverdue(date: string | null | undefined): boolean {
  if (!date) return false
  return date < todayISO()
}

export function isToday(date: string | null | undefined): boolean {
  return !!date && date.slice(0, 10) === todayISO()
}

export const PRIORITY_RANK: Record<Priority, number> = {
  urgent: 0,
  high: 1,
  medium: 2,
  low: 3,
}

export const PRIORITY_CLASS: Record<Priority, string> = {
  urgent: "bg-red-100 text-red-700",
  high: "bg-orange-100 text-orange-700",
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
