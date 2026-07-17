import { useMemo, useState } from "react"
import { useNavigate } from "react-router-dom"
import { useQueryClient } from "@tanstack/react-query"
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
import { EntityForm } from "@/components/EntityForm"
import { RecurrenceScopeDialog } from "@/components/RecurrenceScopeDialog"
import { UnscheduledTray } from "@/components/UnscheduledTray"
import { events, tasks } from "@/services/api/hooks"
import { EVENT_FIELDS } from "@/services/api/registry"
import {
  deleteOccurrence,
  editOccurrence,
  type RecurrenceScope,
} from "@/services/calendar/recurrence"
import {
  SOURCES,
  useCalendarSources,
  type CalendarItem,
} from "@/services/calendar/sources"
import { cn } from "@/lib/utils"
import { ymd } from "@/lib/format"
import type { EventItem } from "@/services/api/types"

function toBasicUtc(iso: string): string {
  return new Date(iso).toISOString().replace(/[-:]/g, "").replace(/\.\d{3}/, "")
}
function addDay(d: string): string {
  const dt = new Date(`${d}T00:00:00Z`)
  dt.setUTCDate(dt.getUTCDate() + 1)
  return dt.toISOString().slice(0, 10)
}
function hms(d: Date): string {
  return `${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}:00`
}

function eventToInput(ev: EventItem): EventInput {
  const base: EventInput = {
    id: ev.id,
    title: ev.title,
    allDay: ev.all_day,
    editable: true,
    extendedProps: { recurring: !!ev.recurrence, kind: "event" },
  }
  if (ev.recurrence) {
    base.rrule = `DTSTART:${toBasicUtc(ev.start_at)}\nRRULE:${ev.recurrence}`
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
  return { ...common, start: it.start, end: it.end ? addDay(it.end) : undefined, allDay: true }
}

const LAYERS_KEY = "personal_calendar_layers"

interface PendingMove {
  masterId: string
  occurrenceDate: string
  changes: Partial<EventItem>
  revert: () => void
}
interface Clicked {
  id: string
  title: string
  occurrenceDate: string
  recurring: boolean
}

export function CalendarPage() {
  const navigate = useNavigate()
  const qc = useQueryClient()
  const [range, setRange] = useState<{ start?: string; end?: string }>({})
  const [pendingMove, setPendingMove] = useState<PendingMove | null>(null)
  const [clicked, setClicked] = useState<Clicked | null>(null)
  const [deleting, setDeleting] = useState<Clicked | null>(null)
  const [creating, setCreating] = useState<{ start: string; end: string; allDay: boolean } | null>(null)

  const [enabled, setEnabled] = useState<Set<string>>(() => {
    try {
      const raw = localStorage.getItem(LAYERS_KEY)
      if (raw) return new Set(JSON.parse(raw) as string[])
    } catch {
      /* default below */
    }
    return new Set(["event", "task", "goal", "healthEvent"])
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
  const remove = events.useRemove()
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
      reschedule(item, ymd(start), arg.event.allDay ? null : hms(start))
      invalidate()
      return
    }
    const end = arg.event.end
    const changes: Partial<EventItem> = {
      start_at: start.toISOString(),
      ...(end ? { end_at: end.toISOString() } : {}),
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
    setClicked({
      id: arg.event.id,
      title: arg.event.title,
      occurrenceDate: (arg.event.start ?? new Date()).toISOString(),
      recurring: !!arg.event.extendedProps.recurring,
    })
  }

  const applyMove = async (scope: RecurrenceScope) => {
    if (!pendingMove) return
    const { masterId, occurrenceDate, changes } = pendingMove
    pendingMove.revert()
    setPendingMove(null)
    await editOccurrence(masterId, scope, occurrenceDate, changes)
    invalidate()
  }
  const applyDelete = async (scope: RecurrenceScope) => {
    if (!deleting) return
    const d = deleting
    setDeleting(null)
    await deleteOccurrence(d.id, scope, d.occurrenceDate)
    invalidate()
  }

  return (
    <div className="space-y-3">
      {/* Layer legend */}
      <div className="flex flex-wrap gap-1.5">
        {[{ key: "event", label: "Events", color: "#4f46e5" }, ...SOURCES].map((s) => {
          const on = enabled.has(s.key)
          return (
            <button
              key={s.key}
              onClick={() => toggle(s.key)}
              className={cn(
                "flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs font-medium transition",
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
          <FullCalendar
            plugins={[dayGridPlugin, timeGridPlugin, listPlugin, interactionPlugin, rrulePlugin]}
            initialView="dayGridMonth"
            headerToolbar={{
              left: "prev,next today",
              center: "title",
              right: "dayGridMonth,timeGridWeek,timeGridDay,listMonth",
            }}
            buttonText={{ listMonth: "agenda" }}
            height="auto"
            nowIndicator
            selectable
            editable
            droppable
            dayMaxEvents
            events={fcEvents}
            datesSet={(arg: DatesSetArg) =>
              setRange({ start: arg.start.toISOString(), end: arg.end.toISOString() })
            }
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
                  : { scheduled_date: ymd(arg.date), scheduled_time: hms(arg.date) },
              })
            }}
            eventReceive={(arg) => arg.event.remove()}
          />
        </div>
      </div>

      {creating && (
        <Modal title="New event" onClose={() => setCreating(null)}>
          <EntityForm
            fields={EVENT_FIELDS}
            initial={{
              start_at: creating.start,
              end_at: creating.allDay ? null : creating.end,
              all_day: creating.allDay,
            }}
            onCancel={() => setCreating(null)}
            onSubmit={(body) => {
              create.mutate(body as Record<string, unknown>)
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

      {clicked && (
        <Modal title={clicked.title} onClose={() => setClicked(null)}>
          <div className="flex flex-col gap-2">
            <Button
              onClick={() => {
                navigate(`/events/${clicked.id}`)
                setClicked(null)
              }}
            >
              Open details
            </Button>
            <Button
              variant="danger"
              onClick={() => {
                const c = clicked
                setClicked(null)
                if (c.recurring) setDeleting(c)
                else if (window.confirm("Delete this event?")) remove.mutate(c.id)
              }}
            >
              Delete
            </Button>
          </div>
        </Modal>
      )}

      {deleting && (
        <RecurrenceScopeDialog
          title="Delete recurring event"
          confirmLabel="Delete"
          danger
          onChoose={applyDelete}
          onCancel={() => setDeleting(null)}
        />
      )}
    </div>
  )
}
