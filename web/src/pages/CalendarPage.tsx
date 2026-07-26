import { useMemo, useRef, useState } from "react"
import { Outlet, useNavigate } from "react-router-dom"
import { useQueryClient } from "@tanstack/react-query"
import { ChevronLeft, ChevronRight } from "lucide-react"
import FullCalendar from "@fullcalendar/react"
import dayGridPlugin from "@fullcalendar/daygrid"
import timeGridPlugin from "@fullcalendar/timegrid"
import interactionPlugin from "@fullcalendar/interaction"
import listPlugin from "@fullcalendar/list"
import rrulePlugin from "@fullcalendar/rrule"
import type {
  DateSelectArg,
  DatesSetArg,
  EventClickArg,
  EventDropArg,
  EventInput,
} from "@fullcalendar/core"
import type { EventResizeDoneArg } from "@fullcalendar/interaction"
import { Button, Modal } from "@/components/ui/primitives"
import { Segmented } from "@/components/detail/kit"
import { QuickCreate } from "@/components/QuickCreate"
import { RecurrenceScopeDialog } from "@/components/RecurrenceScopeDialog"
import { UnscheduledTray } from "@/components/UnscheduledTray"
import { usePersistentState } from "@/lib/persistentState"
import { events, tasks } from "@/services/api/hooks"
import { editOccurrence, type RecurrenceScope } from "@/services/calendar/recurrence"
import {
  SOURCES,
  useCalendarSources,
  type CalendarItem,
} from "@/services/calendar/sources"
import { cn } from "@/lib/utils"
import {
  addDays,
  dayOfDate as ymd,
  instantOfDate,
  rruleDtstart,
  timeOfDate,
  type CalendarDay,
} from "@/lib/date"
import type { EventItem } from "@/services/api/types"


function eventToInput(ev: EventItem): EventInput {
  const base: EventInput = {
    id: ev.id,
    title: ev.title,
    allDay: ev.all_day,
    editable: true,
    extendedProps: { recurring: !!ev.recurrence, kind: "event" },
  }
  if (ev.recurrence) {
    base.rrule = `DTSTART:${rruleDtstart(ev.start_at)}\nRRULE:${ev.recurrence}`
    if (ev.end_at) base.duration = new Date(ev.end_at).getTime() - new Date(ev.start_at).getTime()
    if (ev.recurrence_exdates?.length) base.exdate = ev.recurrence_exdates
  } else {
    base.start = ev.start_at
    if (ev.end_at) base.end = ev.end_at
  }
  return base
}

function itemToInput(it: CalendarItem): EventInput {
  const common = {
    id: it.id,
    title: it.title,
    editable: it.editable,
    backgroundColor: it.color,
    borderColor: it.color,
    extendedProps: { kind: "source", url: it.url },
  }
  if (!it.allDay) {
    return { ...common, start: it.start, end: it.end, allDay: false }
  }
  return { ...common, start: it.start, end: it.end ? addDays(it.end as CalendarDay, 1) : undefined, allDay: true }
}

const LAYERS_KEY = "wild_life_calendar_layers"

type ViewType = "dayGridMonth" | "timeGridWeek" | "timeGridDay" | "listMonth"
const VIEWS: { value: ViewType; label: string }[] = [
  { value: "dayGridMonth", label: "Month" },
  { value: "timeGridWeek", label: "Week" },
  { value: "timeGridDay", label: "Day" },
  { value: "listMonth", label: "Agenda" },
]

interface PendingMove {
  masterId: string
  occurrenceDate: string
  changes: Partial<EventItem>
  revert: () => void
}

/** The range the drag selected, shown back as the dialog's title. */
function rangeLabel({
  start,
  end,
  allDay,
}: {
  start: string
  end: string
  allDay: boolean
}): string {
  const s = new Date(start)
  const day = s.toLocaleDateString(undefined, { weekday: "short", month: "short", day: "numeric" })
  if (allDay) return `New event · ${day}`
  const time = (d: Date) => d.toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" })
  return `New event · ${day} ${time(s)}–${time(new Date(end))}`
}

export function CalendarPage() {
  const navigate = useNavigate()
  const qc = useQueryClient()
  const [range, setRange] = useState<{ start?: string; end?: string }>({})
  const [pendingMove, setPendingMove] = useState<PendingMove | null>(null)
  const [creating, setCreating] = useState<{ start: string; end: string; allDay: boolean } | null>(null)
  // Remember where you left the calendar (view + focused date) across visits.
  const [calView, setCalView] = usePersistentState("calendar:view", "dayGridMonth")
  const [calDate, setCalDate] = usePersistentState<string | null>("calendar:date", null)

  // Drive FullCalendar from our own header/gestures instead of its toolbar.
  const calRef = useRef<FullCalendar>(null)
  const cal = () => calRef.current?.getApi()
  const [title, setTitle] = useState("")
  const [viewType, setViewType] = useState<ViewType>(calView as ViewType)
  const swipe = useRef<{ x: number; y: number } | null>(null)
  const gridRef = useRef<HTMLDivElement>(null)

  // Page the calendar with a subtle directional slide (dir 1 = next / from the
  // right, -1 = prev / from the left). Respects reduced-motion.
  const paginate = (dir: 1 | -1) => {
    const api = cal()
    if (!api) return
    if (dir > 0) api.next()
    else api.prev()
    const el = gridRef.current?.querySelector<HTMLElement>(".fc-view-harness")
    if (el && !window.matchMedia?.("(prefers-reduced-motion: reduce)").matches) {
      el.animate(
        [
          { transform: `translateX(${dir * 20}px)`, opacity: 0 },
          { transform: "translateX(0)", opacity: 1 },
        ],
        { duration: 200, easing: "cubic-bezier(0.32, 0.72, 0, 1)" },
      )
    }
  }

  const [enabled, setEnabled] = useState<Set<string>>(() => {
    try {
      const raw = localStorage.getItem(LAYERS_KEY)
      if (raw) return new Set(JSON.parse(raw) as string[])
    } catch {
      /* default below */
    }
    return new Set(["event", "task", "outcome"])
  })
  const toggle = (key: string) =>
    setEnabled((prev) => {
      const next = new Set(prev)
      if (next.has(key)) next.delete(key)
      else next.add(key)
      localStorage.setItem(LAYERS_KEY, JSON.stringify([...next]))
      return next
    })

  const showEvents = enabled.has("event")
  const inRange = events.useList(
    range.start && range.end
      ? { start_at__gte: range.start, start_at__lte: range.end, limit: "500" }
      : undefined,
    { enabled: showEvents && !!range.start },
  )
  const recurring = events.useList(
    { recurrence__isnull: "false", limit: "500" },
    { enabled: showEvents },
  )
  const update = events.useUpdate()
  const create = events.useCreate()
  const taskUpd = tasks.useUpdate()
  const { items, reschedule } = useCalendarSources(range, enabled)

  const invalidate = () => qc.invalidateQueries()

  const fcEvents = useMemo<EventInput[]>(() => {
    const out: EventInput[] = []
    if (showEvents) {
      const byId = new Map<string, EventItem>()
      for (const e of inRange.data ?? []) byId.set(e.id, e)
      for (const e of recurring.data ?? []) byId.set(e.id, e)
      for (const e of byId.values()) out.push(eventToInput(e))
    }
    for (const it of items) out.push(itemToInput(it))
    return out
  }, [showEvents, inRange.data, recurring.data, items])

  const onDrop = (arg: EventDropArg | EventResizeDoneArg) => {
    const start = arg.event.start
    if (!start) return arg.revert()
    if (arg.event.extendedProps.kind === "source") {
      const item = items.find((i) => i.id === arg.event.id)
      if (!item) return arg.revert()
      reschedule(item, ymd(start), arg.event.allDay ? null : timeOfDate(start))
      invalidate()
      return
    }
    const end = arg.event.end
    const changes: Partial<EventItem> = {
      start_at: instantOfDate(start),
      ...(end ? { end_at: instantOfDate(end) } : {}),
    }
    if (arg.event.extendedProps.recurring) {
      setPendingMove({
        masterId: arg.event.id,
        occurrenceDate: (arg.oldEvent.start ?? start).toISOString(),
        changes,
        revert: arg.revert,
      })
      return
    }
    update.mutate({ id: arg.event.id, body: changes })
  }

  const onClick = (arg: EventClickArg) => {
    if (arg.event.extendedProps.kind === "source") {
      navigate(String(arg.event.extendedProps.url))
      return
    }
    // Open the event's detail drawer in place (deep-linkable). `occ` carries the
    // clicked occurrence's start so a recurring delete can scope to it.
    const occ = (arg.event.start ?? new Date()).toISOString()
    navigate(`/calendar/${arg.event.id}?occ=${encodeURIComponent(occ)}`)
  }

  const applyMove = async (scope: RecurrenceScope) => {
    if (!pendingMove) return
    const { masterId, occurrenceDate, changes } = pendingMove
    pendingMove.revert()
    setPendingMove(null)
    await editOccurrence(masterId, scope, occurrenceDate, changes)
    invalidate()
  }

  return (
    <div className="space-y-3">
      {/* Layer legend — one scrollable row on mobile, wraps on desktop */}
      <div className="flex gap-1.5 overflow-x-auto pb-1 [scrollbar-width:none] sm:flex-wrap sm:overflow-visible sm:pb-0 [&::-webkit-scrollbar]:hidden">
        {[{ key: "event", label: "Events", color: "#4f46e5" }, ...SOURCES].map((s) => {
          const on = enabled.has(s.key)
          return (
            <button
              key={s.key}
              onClick={() => toggle(s.key)}
              className={cn(
                "flex shrink-0 items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs font-medium transition",
                on
                  ? "border-slate-300 bg-surface text-slate-700"
                  : "border-slate-200 bg-transparent text-slate-400",
              )}
            >
              <span
                className="h-2.5 w-2.5 rounded-full"
                style={{ backgroundColor: on ? s.color : "transparent", border: `1px solid ${s.color}` }}
              />
              {s.label}
            </button>
          )
        })}
      </div>

      <div className="flex flex-col gap-3 sm:flex-row-reverse">
        <UnscheduledTray />
        <div className="min-w-0 flex-1 rounded-2xl border border-slate-200/80 bg-surface p-3 shadow-soft sm:p-5">
          {/* Custom header: title + Today (+ desktop prev/next) on one line, view
              switcher on its own row on mobile so nothing collides or wraps. */}
          <div className="mb-3 flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
            <div className="flex min-w-0 items-center gap-1.5">
              <div className="hidden items-center gap-0.5 sm:flex">
                <button
                  type="button"
                  aria-label="Previous"
                  onClick={() => paginate(-1)}
                  className="rounded-lg p-1.5 text-slate-500 transition hover:bg-slate-100 hover:text-slate-800"
                >
                  <ChevronLeft size={18} />
                </button>
                <button
                  type="button"
                  aria-label="Next"
                  onClick={() => paginate(1)}
                  className="rounded-lg p-1.5 text-slate-500 transition hover:bg-slate-100 hover:text-slate-800"
                >
                  <ChevronRight size={18} />
                </button>
              </div>
              <h2 className="truncate text-lg font-semibold text-slate-900">{title}</h2>
              <Button
                variant="secondary"
                size="sm"
                className="ml-1 shrink-0"
                onClick={() => cal()?.today()}
              >
                Today
              </Button>
            </div>
            <Segmented options={VIEWS} value={viewType} onChange={(v) => cal()?.changeView(v)} />
          </div>

          {/* Swipe horizontally to page the calendar; guards skip event drags,
              multi-touch, and vertical scrolls. */}
          <div
            ref={gridRef}
            onTouchStart={(e) => {
              if (e.touches.length !== 1 || (e.target as HTMLElement).closest?.(".fc-event")) {
                swipe.current = null
                return
              }
              swipe.current = { x: e.touches[0].clientX, y: e.touches[0].clientY }
            }}
            onTouchEnd={(e) => {
              const start = swipe.current
              swipe.current = null
              if (!start) return
              const t = e.changedTouches[0]
              const dx = t.clientX - start.x
              const dy = t.clientY - start.y
              if (Math.abs(dx) > 60 && Math.abs(dx) > Math.abs(dy) * 1.5) {
                paginate(dx < 0 ? 1 : -1)
              }
            }}
          >
          <FullCalendar
            ref={calRef}
            plugins={[dayGridPlugin, timeGridPlugin, listPlugin, interactionPlugin, rrulePlugin]}
            initialView={calView}
            initialDate={calDate ?? undefined}
            headerToolbar={false}
            // Fill the viewport and let weeks share the height evenly, instead of
            // sizing to content (which left short/tall rows and dead space).
            height="calc(100vh - 12rem)"
            expandRows
            nowIndicator
            selectable
            editable
            droppable
            dayMaxEvents
            events={fcEvents}
            datesSet={(arg: DatesSetArg) => {
              setRange({ start: arg.start.toISOString(), end: arg.end.toISOString() })
              setCalView(arg.view.type)
              setCalDate(arg.view.currentStart.toISOString())
              setTitle(arg.view.title)
              setViewType(arg.view.type as ViewType)
            }}
            eventClick={onClick}
            select={(arg: DateSelectArg) =>
              setCreating({
                start: arg.start.toISOString(),
                end: arg.end.toISOString(),
                allDay: arg.allDay,
              })
            }
            eventDrop={onDrop}
            eventResize={onDrop}
            drop={(arg) => {
              const id = arg.draggedEl.getAttribute("data-task-id")
              if (!id) return
              taskUpd.mutate({
                id,
                body: arg.allDay
                  ? { scheduled_date: ymd(arg.date), scheduled_time: null }
                  : { scheduled_date: ymd(arg.date), scheduled_time: timeOfDate(arg.date) },
              })
            }}
            eventReceive={(arg) => arg.event.remove()}
          />
          </div>
        </div>
      </div>

      {/* The drag already said when. Asking for the time again — inside a
          nine-field form — is asking the user to repeat their own gesture, so
          this only takes the title and shows the range back as context. */}
      {creating && (
        <Modal title={rangeLabel(creating)} onClose={() => setCreating(null)}>
          <QuickCreate
            placeholder="What's happening?"
            onCreate={(title) => {
              create.mutate({
                title,
                start_at: creating.start,
                end_at: creating.allDay ? null : creating.end,
                all_day: creating.allDay,
              })
              setCreating(null)
            }}
          />
        </Modal>
      )}

      {pendingMove && (
        <RecurrenceScopeDialog
          title="Change recurring event"
          confirmLabel="Save"
          onChoose={applyMove}
          onCancel={() => {
            pendingMove.revert()
            setPendingMove(null)
          }}
        />
      )}

      {/* Clicking an event deep-links to /calendar/:id, mounting the detail drawer here. */}
      <Outlet />
    </div>
  )
}
