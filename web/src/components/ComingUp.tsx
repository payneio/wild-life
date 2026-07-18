import { useMemo } from "react"
import { Link } from "react-router-dom"
import { Card } from "@/components/ui/primitives"
import { events } from "@/services/api/hooks"
import { SOURCES, useCalendarSources } from "@/services/calendar/sources"
import { cn } from "@/lib/utils"
import { localDay, ymd } from "@/lib/format"

const HORIZON_DAYS = 21
const EVENT_COLOR = "#4f46e5"

function isoDay(offset: number): string {
  const d = new Date()
  d.setDate(d.getDate() + offset)
  return ymd(d)
}

function countdown(date: string, today: string): { label: string; overdue: boolean } {
  const days = Math.round(
    (new Date(`${date}T00:00:00`).getTime() - new Date(`${today}T00:00:00`).getTime()) /
      86400000,
  )
  if (days < 0) return { label: `${-days}d overdue`, overdue: true }
  if (days === 0) return { label: "Today", overdue: false }
  if (days === 1) return { label: "Tomorrow", overdue: false }
  return { label: `in ${days}d`, overdue: false }
}

interface Row {
  key: string
  date: string
  title: string
  color: string
  url: string
}

/** A forward horizon of everything coming due across the app's time-based data. */
export function ComingUp() {
  const today = isoDay(0)
  const range = { start: `${today}T00:00:00.000Z`, end: `${isoDay(HORIZON_DAYS)}T23:59:59.000Z` }
  const allKeys = useMemo(() => new Set(SOURCES.map((s) => s.key)), [])
  const { items } = useCalendarSources(range, allKeys)
  const upcomingEvents = events.useList(
    { start_at__gte: range.start, start_at__lte: range.end, limit: "100" },
    { enabled: true },
  )

  const rows = useMemo<Row[]>(() => {
    const out: Row[] = items.map((it) => ({
      key: it.id,
      date: localDay(it.start),
      title: it.title,
      color: it.color,
      url: it.url,
    }))
    for (const e of upcomingEvents.data ?? []) {
      out.push({
        key: `event:${e.id}`,
        date: localDay(e.start_at),
        title: e.title,
        color: EVENT_COLOR,
        url: `/calendar/${e.id}`,
      })
    }
    return out
      .filter((r) => r.date >= today)
      .sort((a, b) => a.date.localeCompare(b.date))
      .slice(0, 40)
  }, [items, upcomingEvents.data, today])

  if (rows.length === 0) return null

  return (
    <Card className="p-4">
      <div className="mb-2 text-sm font-semibold text-slate-700">Coming up</div>
      <div className="space-y-0.5">
        {rows.map((r) => {
          const c = countdown(r.date, today)
          return (
            <Link
              key={r.key}
              to={r.url}
              className="flex items-center gap-2.5 rounded-lg px-2 py-1.5 hover:bg-slate-100"
            >
              <span
                className="h-2.5 w-2.5 shrink-0 rounded-full"
                style={{ backgroundColor: r.color }}
              />
              <span className="min-w-0 flex-1 truncate text-sm text-slate-700">{r.title}</span>
              <span
                className={cn(
                  "shrink-0 text-xs font-medium",
                  c.overdue ? "text-red-600" : "text-slate-400",
                )}
              >
                {c.label}
              </span>
            </Link>
          )
        })}
      </div>
    </Card>
  )
}
