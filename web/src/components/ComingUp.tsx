import { useMemo } from "react"
import { Link } from "react-router-dom"
import { Card } from "@/components/ui/primitives"
import { useOccurrences } from "@/services/api/hooks"
import { SOURCES, useCalendarSources } from "@/services/calendar/sources"
import { cn } from "@/lib/utils"
import { localDay } from "@/lib/format"
import { addDays, daysBetween, endOfDay, startOfDay, today as todayDay, type CalendarDay } from "@/lib/date"

const HORIZON_DAYS = 21
const EVENT_COLOR = "#4f46e5"

function countdown(date: CalendarDay, today: CalendarDay): { label: string; overdue: boolean } {
  const days = daysBetween(today, date)
  if (days < 0) return { label: `${-days}d overdue`, overdue: true }
  if (days === 0) return { label: "Today", overdue: false }
  if (days === 1) return { label: "Tomorrow", overdue: false }
  return { label: `in ${days}d`, overdue: false }
}

interface Row {
  key: string
  date: CalendarDay
  title: string
  color: string
  url: string
}

/** A forward horizon of everything coming due across the app's time-based data. */
export function ComingUp() {
  const today = todayDay()
  const range = { start: startOfDay(today), end: endOfDay(addDays(today, HORIZON_DAYS)) }
  const allKeys = useMemo(() => new Set(SOURCES.map((s) => s.key)), [])
  const { items } = useCalendarSources(range, allKeys)
  // Occasions, expanded server-side — a recurring meeting next week is computed.
  const upcomingEvents = useOccurrences(range)

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
        key: `occasion:${e.moment_id ?? e.rule_id}:${e.occurrence_at}`,
        date: localDay(e.start_at),
        title: e.title ?? "Untitled",
        color: EVENT_COLOR,
        url: e.moment_id ? `/calendar/${e.moment_id}` : `/routines/${e.rule_id}`,
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
              <span className="min-w-0 flex-1 break-words text-sm text-slate-700">{r.title}</span>
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
