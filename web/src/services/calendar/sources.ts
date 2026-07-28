// Calendar source registry — turns every dated entity in the app into a
// toggleable colored layer on the calendar. Only Events carry real recurrence
// (handled specially in CalendarPage); every source here is a single clean Date
// field rendered as an all-day chip, drag-rescheduled by one PATCH.

import {
  commitments,
  delegations,
  outcomes,
  moments,
  people,
  projects,
  requests,
  tasks,
} from "@/services/api/hooks"
import { localInputToInstant } from "@/lib/date"
import { whenOf } from "@/lib/moments"

export interface SourceMeta {
  key: string
  label: string
  color: string
}

export const SOURCES: SourceMeta[] = [
  { key: "task", label: "Tasks", color: "#6366f1" },
  { key: "outcome", label: "Outcomes", color: "#10b981" },
  { key: "commitment", label: "Commitments", color: "#f59e0b" },
  { key: "request", label: "Requests", color: "#eab308" },
  { key: "delegation", label: "Delegations", color: "#8b5cf6" },
  { key: "reflection", label: "Journal", color: "#64748b" },
  { key: "birthday", label: "Birthdays", color: "#ec4899" },
  { key: "project", label: "Projects", color: "#0ea5e9" },
]

export interface CalendarItem {
  id: string // FC id, unique across sources
  sourceKey: string
  rowId: string
  title: string
  start: string // "YYYY-MM-DD" (all-day) or ISO datetime (timed)
  end?: string
  allDay: boolean
  color: string
  url: string
  editable: boolean
  field?: string // the date column to PATCH on drag
}

const COLOR = Object.fromEntries(SOURCES.map((s) => [s.key, s.color])) as Record<
  string,
  string
>

function day(d: string): string {
  return d.slice(0, 10)
}

interface Range {
  start?: string
  end?: string
}

export function useCalendarSources(range: Range, enabled: Set<string>) {
  const on = (k: string) => ({ enabled: !!range.start && enabled.has(k) })
  const from = range.start ? day(range.start) : undefined
  const to = range.end ? day(range.end) : undefined
  const between = (field: string) =>
    from ? { [`${field}__gte`]: from, [`${field}__lte`]: to, limit: "500" } : undefined

  // One list query + one update mutation per source (fixed order → hook-safe).
  const taskQ = tasks.useList(between("scheduled_date"), on("task"))
  const outcomeQ = outcomes.useList(between("by_when"), on("outcome"))
  const commitQ = commitments.useList(between("due_date"), on("commitment"))
  const reqQ = requests.useList(between("follow_up_date"), on("request"))
  const delegQ = delegations.useList(
    between("expected_completion_date"),
    on("delegation"),
  )
  // The Journal layer is `reflection` and nothing else. Observations live on the
  // record they are about, and drawing all prose here would put 593 of them on a
  // calendar that is meant to answer "what is my week".
  const reflectionQ = moments.useList(
    from ? { kind: "reflection", since: from, until: to, limit: "500" } : undefined,
    on("reflection"),
  )
  const projectQ = projects.useList(between("start_date"), on("project"))
  const peopleQ = people.useList(undefined, on("birthday")) // filtered client-side

  const taskUpd = tasks.useUpdate()
  const outcomeUpd = outcomes.useUpdate()
  const commitUpd = commitments.useUpdate()
  const reqUpd = requests.useUpdate()
  const delegUpd = delegations.useUpdate()
  const momentUpd = moments.useUpdate()

  const items: CalendarItem[] = []
  const push = (
    key: string,
    rowId: string,
    title: string,
    date: string | null | undefined,
    field: string,
    editable = true,
    end?: string,
  ) => {
    if (!date) return
    items.push({
      id: `${key}:${rowId}`,
      sourceKey: key,
      rowId,
      title,
      start: day(date),
      end: end ? day(end) : undefined,
      allDay: true,
      color: COLOR[key],
      url: URL_FOR[key](rowId),
      editable,
      field,
    })
  }

  if (enabled.has("task"))
    for (const t of taskQ.data ?? []) {
      if (t.scheduled_date && t.scheduled_time) {
        const start = `${t.scheduled_date}T${t.scheduled_time}`
        const end = t.estimated_minutes
          ? new Date(new Date(start).getTime() + t.estimated_minutes * 60000).toISOString()
          : undefined
        items.push({
          id: `task:${t.id}`,
          sourceKey: "task",
          rowId: t.id,
          title: t.title,
          start,
          end,
          allDay: false,
          color: COLOR.task,
          url: URL_FOR.task(t.id),
          editable: true,
          field: "scheduled_date",
        })
      } else {
        push("task", t.id, t.title, t.scheduled_date, "scheduled_date")
      }
    }
  if (enabled.has("outcome"))
    for (const o of outcomeQ.data ?? [])
      push("outcome", o.id, `🎯 ${o.statement}`, o.by_when, "by_when")
  if (enabled.has("commitment"))
    for (const c of commitQ.data ?? []) push("commitment", c.id, c.description, c.due_date, "due_date")
  if (enabled.has("request"))
    for (const w of reqQ.data ?? []) push("request", w.id, `⏳ ${w.subject}`, w.follow_up_date, "follow_up_date")
  if (enabled.has("delegation"))
    for (const d of delegQ.data ?? []) push("delegation", d.id, `→ ${d.requested_outcome}`, d.expected_completion_date, "expected_completion_date")
  if (enabled.has("reflection"))
    for (const m of reflectionQ.data ?? [])
      push("reflection", m.id, m.title || m.body?.slice(0, 60) || "Reflection", whenOf(m), "started_at")
  if (enabled.has("project"))
    for (const p of projectQ.data ?? []) push("project", p.id, p.name, p.start_date, "start_date", false, p.target_date ?? undefined)
  if (enabled.has("birthday") && from) {
    const years = [Number(from.slice(0, 4)), Number(to!.slice(0, 4))]
    for (const person of peopleQ.data ?? []) {
      if (!person.birthday) continue
      const md = person.birthday.slice(5) // MM-DD
      for (const y of [...new Set(years)]) {
        const date = `${y}-${md}`
        if (date >= from && date <= to!)
          push("birthday", `${person.id}-${y}`, `🎂 ${person.name}`, date, "", false)
      }
    }
  }

  const UPD: Record<string, { mutate: (v: { id: string; body: Record<string, unknown> }) => void } | null> = {
    task: taskUpd,
    outcome: outcomeUpd,
    commitment: commitUpd,
    request: reqUpd,
    delegation: delegUpd,
    reflection: momentUpd,
    project: null,
    birthday: null,
  }

  const reschedule = (item: CalendarItem, newDate: string, newTime?: string | null) => {
    const upd = UPD[item.sourceKey]
    if (!upd || !item.field) return
    const body: Record<string, unknown> = { [item.field]: newDate }
    // Tasks carry an optional time-of-day; a timed drag sets it, an all-day drag clears it.
    if (item.sourceKey === "task") body.scheduled_time = newTime ?? null
    // A moment is placed by an instant, not a day. Noon, for the reason the
    // backfill anchors there: midnight slides across the date line when rendered
    // back in a local zone, and a reflection is day-precision anyway.
    if (item.sourceKey === "reflection")
      body.started_at = localInputToInstant(`${newDate}T${newTime ?? "12:00"}`)
    upd.mutate({ id: item.rowId, body })
  }

  return { items, reschedule }
}

const URL_FOR: Record<string, (id: string) => string> = {
  task: (id) => `/tasks/${id}`,
  outcome: (id) => `/outcomes/${id}`,
  commitment: (id) => `/commitments/${id}`,
  request: (id) => `/requests/${id}`,
  delegation: (id) => `/delegations/${id}`,
  reflection: (id) => `/notes/${id}`,
  project: (id) => `/projects/${id}`,
  birthday: (id) => `/people/${id.split("-").slice(0, 5).join("-")}`,
}
