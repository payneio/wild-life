import { useEffect, useRef, useState } from "react"
import { Draggable } from "@fullcalendar/interaction"
import { useNavigate } from "react-router-dom"
import { GripVertical, SquareArrowOutUpRight, Trash2 } from "lucide-react"
import { Button } from "@/components/ui/primitives"
import { PriorityBadge } from "@/components/cells"
import { ScheduleChips } from "@/components/detail/kit"
import { PickerOverlay } from "@/components/graph/PickerOverlay"
import { tasks } from "@/services/api/hooks"
import { cn, formatDate } from "@/lib/utils"
import type { Priority, Task } from "@/services/api/types"

const PRIORITY_DOT: Record<Priority, string> = {
  urgent: "bg-red-500",
  high: "bg-amber-500",
  medium: "bg-slate-300",
  low: "bg-slate-200",
}

/** A focused actions surface for one unscheduled task — a bottom sheet on
 *  mobile, an anchored popover on desktop (shared `PickerOverlay` shell).
 *  Schedule it, open its detail, or delete it. */
function TaskActions({
  task,
  getAnchor,
  onClose,
}: {
  task: Task
  getAnchor: () => HTMLElement | null
  onClose: () => void
}) {
  const navigate = useNavigate()
  const update = tasks.useUpdate()
  const remove = tasks.useRemove()
  const [confirmDelete, setConfirmDelete] = useState(false)

  return (
    <PickerOverlay getAnchor={getAnchor} onClose={onClose}>
      <div className="p-3">
        <div className="text-sm font-medium text-slate-900">{task.title}</div>
        <div className="mt-1.5 flex flex-wrap items-center gap-2 text-xs text-slate-400">
          <PriorityBadge priority={task.priority} />
          {task.due_date && <span>due {formatDate(task.due_date)}</span>}
        </div>

        <div className="mt-3 border-t border-slate-100 pt-3">
          <div className="mb-1.5 text-[11px] font-semibold uppercase tracking-wide text-slate-400">
            Schedule
          </div>
          <ScheduleChips
            value={task.scheduled_date}
            onSet={(iso) => {
              update.mutate({ id: task.id, body: { scheduled_date: iso } })
              onClose()
            }}
          />
        </div>

        <div className="mt-3 flex items-center gap-2 border-t border-slate-100 pt-3">
          <Button variant="secondary" size="sm" onClick={() => navigate(`/tasks/${task.id}`)}>
            <SquareArrowOutUpRight size={14} /> Open
          </Button>
          {confirmDelete ? (
            <Button
              variant="danger"
              size="sm"
              className="ml-auto"
              onClick={() => {
                remove.mutate(task.id)
                onClose()
              }}
            >
              <Trash2 size={14} /> Confirm delete
            </Button>
          ) : (
            <button
              className="ml-auto inline-flex items-center gap-1 rounded-lg px-2 py-1 text-xs font-medium text-slate-400 transition hover:bg-red-50 hover:text-red-600"
              onClick={() => setConfirmDelete(true)}
            >
              <Trash2 size={14} /> Delete
            </button>
          )}
        </div>
      </div>
    </PickerOverlay>
  )
}

/** Tasks with no scheduled date. On desktop they drag onto the calendar to
 *  plan them (CalendarPage's `drop` handler). Tapping any task — the reliable
 *  path on touch — opens its actions: schedule, open, or delete. */
export function UnscheduledTray() {
  const ref = useRef<HTMLDivElement>(null)
  const q = tasks.useList({
    scheduled_date__isnull: "true",
    status__nin: "completed,cancelled,delivered",
    limit: "50",
  })
  const list = q.data ?? []
  const [active, setActive] = useState<{ task: Task; el: HTMLElement } | null>(null)

  useEffect(() => {
    if (!ref.current) return
    const d = new Draggable(ref.current, {
      itemSelector: ".tray-task",
      eventData: (el) => ({ title: el.getAttribute("data-title") ?? "" }),
    })
    return () => d.destroy()
  }, [q.data])

  return (
    <div className="w-full shrink-0 rounded-2xl border border-slate-200/80 bg-surface p-3 shadow-soft sm:w-56">
      <div className="mb-2 text-[11px] font-semibold uppercase tracking-wide text-slate-400">
        Unscheduled
      </div>
      <div ref={ref} className="space-y-1.5">
        {list.map((t) => (
          <div
            key={t.id}
            role="button"
            tabIndex={0}
            data-task-id={t.id}
            data-title={t.title}
            onClick={(e) => setActive({ task: t, el: e.currentTarget })}
            onKeyDown={(e) => {
              if (e.key === "Enter" || e.key === " ") {
                e.preventDefault()
                setActive({ task: t, el: e.currentTarget })
              }
            }}
            className={cn(
              "tray-task group flex cursor-pointer items-start gap-2 rounded-lg border px-2.5 py-1.5 text-sm transition active:cursor-grabbing",
              active?.task.id === t.id
                ? "border-indigo-300 bg-indigo-50"
                : "border-slate-200 bg-surface-2 hover:border-slate-300",
            )}
          >
            <span
              className={cn("mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full", PRIORITY_DOT[t.priority])}
              aria-hidden
            />
            <span className="min-w-0 flex-1">
              <span className="block truncate text-slate-700">{t.title}</span>
              {t.due_date && (
                <span className="text-xs text-slate-400">due {formatDate(t.due_date)}</span>
              )}
            </span>
            {/* Drag cue on pointer devices only. */}
            <GripVertical
              size={14}
              aria-hidden
              className="mt-0.5 hidden shrink-0 text-slate-300 [@media(hover:hover)]:group-hover:block"
            />
          </div>
        ))}
        {list.length === 0 && (
          <div className="py-2 text-xs text-slate-400">Nothing unscheduled 🎉</div>
        )}
      </div>

      {active && (
        <TaskActions
          task={active.task}
          getAnchor={() => active.el}
          onClose={() => setActive(null)}
        />
      )}
    </div>
  )
}
