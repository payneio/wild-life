import { useEffect, useRef, useState } from "react"
import { Draggable } from "@fullcalendar/interaction"
import { tasks } from "@/services/api/hooks"
import { ScheduleChips } from "@/components/detail/kit"
import { cn } from "@/lib/utils"

/** A tray of tasks with no scheduled date. On desktop they drag onto the
 *  calendar to plan them (see CalendarPage's `drop` handler). Dragging is
 *  unreliable on touch, so tapping a task reveals quick-schedule chips
 *  (Today / Tomorrow / +1wk / pick a date) that set its `scheduled_date` in
 *  place — the mobile path to the same outcome. */
export function UnscheduledTray() {
  const ref = useRef<HTMLDivElement>(null)
  const q = tasks.useList({
    scheduled_date__isnull: "true",
    status__nin: "completed,cancelled,delivered",
    limit: "50",
  })
  const list = q.data ?? []
  const update = tasks.useUpdate()
  const [openId, setOpenId] = useState<string | null>(null)

  useEffect(() => {
    if (!ref.current) return
    const d = new Draggable(ref.current, {
      itemSelector: ".tray-task",
      eventData: (el) => ({ title: el.getAttribute("data-title") ?? "" }),
    })
    return () => d.destroy()
  }, [q.data])

  function schedule(id: string, iso: string | null) {
    update.mutate({ id, body: { scheduled_date: iso } })
    setOpenId(null)
  }

  return (
    <div className="w-full shrink-0 rounded-2xl border border-slate-200/80 bg-surface p-3 shadow-soft sm:w-56">
      <div className="mb-2 text-[11px] font-semibold uppercase tracking-wide text-slate-400">
        Unscheduled
      </div>
      <div ref={ref} className="space-y-1.5">
        {list.map((t) => {
          const open = openId === t.id
          return (
            <div key={t.id}>
              <div
                role="button"
                tabIndex={0}
                className={cn(
                  "tray-task cursor-pointer rounded-lg border px-2.5 py-1.5 text-sm text-slate-700 transition active:cursor-grabbing",
                  open
                    ? "border-indigo-300 bg-indigo-50"
                    : "border-slate-200 bg-surface-2 hover:border-slate-300",
                )}
                data-task-id={t.id}
                data-title={t.title}
                onClick={() => setOpenId(open ? null : t.id)}
                onKeyDown={(e) =>
                  (e.key === "Enter" || e.key === " ") && setOpenId(open ? null : t.id)
                }
              >
                {t.title}
              </div>
              {open && (
                <div className="mt-1.5 mb-1 px-0.5">
                  <ScheduleChips value={null} onSet={(iso) => schedule(t.id, iso)} />
                </div>
              )}
            </div>
          )
        })}
        {list.length === 0 && (
          <div className="py-2 text-xs text-slate-400">Nothing unscheduled 🎉</div>
        )}
      </div>
    </div>
  )
}
