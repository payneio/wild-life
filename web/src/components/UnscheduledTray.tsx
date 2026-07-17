import { useEffect, useRef } from "react"
import { Draggable } from "@fullcalendar/interaction"
import { tasks } from "@/services/api/hooks"

/** A tray of tasks with no scheduled date, draggable onto the calendar to plan
 *  them. The actual scheduling happens in CalendarPage's FullCalendar `drop`
 *  handler (reads the dragged element's data-task-id). */
export function UnscheduledTray() {
  const ref = useRef<HTMLDivElement>(null)
  const q = tasks.useList({
    scheduled_date__isnull: "true",
    status__nin: "completed,cancelled,delivered",
    limit: "50",
  })
  const list = q.data ?? []

  useEffect(() => {
    if (!ref.current) return
    const d = new Draggable(ref.current, {
      itemSelector: ".tray-task",
      eventData: (el) => ({ title: el.getAttribute("data-title") ?? "" }),
    })
    return () => d.destroy()
  }, [list])

  return (
    <div className="w-full shrink-0 rounded-2xl border border-slate-200/80 bg-surface p-3 shadow-soft sm:w-56">
      <div className="mb-2 text-[11px] font-semibold uppercase tracking-wide text-slate-400">
        Unscheduled
      </div>
      <div ref={ref} className="space-y-1.5">
        {list.map((t) => (
          <div
            key={t.id}
            className="tray-task cursor-grab rounded-lg border border-slate-200 bg-surface-2 px-2.5 py-1.5 text-sm text-slate-700 active:cursor-grabbing"
            data-task-id={t.id}
            data-title={t.title}
          >
            {t.title}
          </div>
        ))}
        {list.length === 0 && (
          <div className="py-2 text-xs text-slate-400">Nothing unscheduled 🎉</div>
        )}
      </div>
    </div>
  )
}
