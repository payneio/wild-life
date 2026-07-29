import { useMemo, useRef, useState } from "react"
import { Outlet, useNavigate } from "react-router-dom"
import { useQueryClient } from "@tanstack/react-query"
import { ChevronLeft, ChevronRight } from "lucide-react"
import FullCalendar from "@fullcalendar/react"
import dayGridPlugin from "@fullcalendar/daygrid"
import timeGridPlugin from "@fullcalendar/timegrid"
import interactionPlugin from "@fullcalendar/interaction"
import listPlugin from "@fullcalendar/list"
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
import { RepeatPicker } from "@/components/RepeatPicker"
import { NO_REPEAT, type Repeat } from "@/lib/repeat"
import { WEEKDAYS } from "@/lib/slots"
import {
  moments,
  occurrenceKey,
  routines,
  tasks,
  useEditOccurrence,
  useOccurrences,
} from "@/services/api/hooks"
import {
  SOURCES,
  useCalendarSources,
  type CalendarItem,
} from "@/services/calendar/sources"
import { AGENDA_VIEW, asView, VIEWS, type ViewType } from "@/services/calendar/views"
import { cn } from "@/lib/utils"
import {
  addDays,
  compareDays,
  dayOfDate,
  dayOfDate as ymd,
  instantOfDate,
  timeOfDate,
  today,
  type CalendarDay,
} from "@/lib/date"
import type { Occurrence, RecurrenceScope } from "@/services/api/types"


/**
 * One occurrence, already expanded.
 *
 * There is no `rrule` here and no rrule plugin any more: the server expands
 * every series (`GET /occurrences`), so this component stopped being the only
 * thing in the app that knew when a recurring meeting actually happens. A row
 * carries a `moment_id` when something has happened to it and a `rule_id` when
 * it is a projection — both, when it is an exception to a series — and the drag
 * handlers below need exactly that pair to say what they are editing.
 */
function occurrenceToInput(o: Occurrence): EventInput {
  return {
    id: occurrenceKey(o),
    title: o.title ?? "(untitled)",
    start: o.start_at,
    end: o.end_at ?? undefined,
    allDay: o.all_day,
    editable: true,
    extendedProps: {
      kind: "occurrence",
      momentId: o.moment_id,
      ruleId: o.rule_id,
      occurrenceAt: o.occurrence_at,
      recurring: !!o.rule_id,
    },
  }
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

/** A drag on a recurring occurrence, held until the user says how far it reaches. */
interface PendingMove {
  ruleId: string
  momentId: string | null
  occurrenceAt: string
  changes: { start_at: string; end_at?: string | null }
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
  const [repeat, setRepeat] = useState<Repeat>(NO_REPEAT)
  // Remember where you left the calendar (view + focused date) across visits.
  const [calView, setCalView] = usePersistentState("calendar:view", "dayGridMonth")
  const [calDate, setCalDate] = usePersistentState<string | null>("calendar:date", null)
  const initialView = asView(calView)
  // Where you left it, honoured — except an agenda left behind, which is a
  // forward-looking list and would open in the past. Then today is where you
  // left off. Read once; FullCalendar owns the date from mount on.
  const [initialDate] = useState<string | undefined>(() =>
    calDate &&
    !(initialView === "agenda" && compareDays(dayOfDate(new Date(calDate)), today()) < 0)
      ? calDate
      : undefined,
  )

  // Drive FullCalendar from our own header/gestures instead of its toolbar.
  const calRef = useRef<FullCalendar>(null)
  const cal = () => calRef.current?.getApi()
  const [title, setTitle] = useState("")
  const [viewType, setViewType] = useState<ViewType>(initialView)
  const [showsToday, setShowsToday] = useState(true)

  /**
   * The day a view switch should land on.
   *
   * FullCalendar carries `currentStart` across a switch, which for a month is
   * the 1st — so Month → Agenda on the 27th opened three weeks back. If the view
   * you're leaving is showing today, today is the day you meant.
   */
  const focusDate = (): Date | undefined => {
    const view = cal()?.view
    if (!view) return undefined
    const now = new Date()
    return now >= view.activeStart && now < view.activeEnd ? now : view.currentStart
  }
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
  const occurrences = useOccurrences(range, showEvents)
  const editOcc = useEditOccurrence()
  const create = moments.useCreate()
  const createSeries = routines.useCreate()
  const taskUpd = tasks.useUpdate()
  const { items, reschedule } = useCalendarSources(range, enabled)

  const invalidate = () => qc.invalidateQueries()

  const fcEvents = useMemo<EventInput[]>(() => {
    const out: EventInput[] = []
    if (showEvents) for (const o of occurrences.data ?? []) out.push(occurrenceToInput(o))
    for (const it of items) out.push(itemToInput(it))
    return out
  }, [showEvents, occurrences.data, items])

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
    const props = arg.event.extendedProps
    const changes = {
      start_at: instantOfDate(start),
      ...(end ? { end_at: instantOfDate(end) } : {}),
    }
    // A row belonging to a series has to say how far the change reaches; a
    // one-off has only itself, so there is nothing to ask.
    if (props.ruleId) {
      setPendingMove({
        ruleId: String(props.ruleId),
        momentId: props.momentId ? String(props.momentId) : null,
        occurrenceAt: String(props.occurrenceAt),
        changes,
        revert: arg.revert,
      })
      return
    }
    editOcc.mutate({ scope: "this", moment_id: String(props.momentId), changes })
  }

  const onClick = (arg: EventClickArg) => {
    const props = arg.event.extendedProps
    if (props.kind === "source") {
      navigate(String(props.url))
      return
    }
    // A stored occurrence opens itself. A projection has no row to open — and
    // creating one just because you looked at it is exactly what "computed,
    // never materialised" forbids — so it opens the series that produces it.
    if (props.momentId) {
      navigate(`/calendar/${props.momentId}?occ=${encodeURIComponent(String(props.occurrenceAt))}`)
    } else if (props.ruleId) {
      navigate(`/routines/${props.ruleId}`)
    }
  }

  const applyMove = async (scope: RecurrenceScope) => {
    if (!pendingMove) return
    const { ruleId, momentId, occurrenceAt, changes } = pendingMove
    pendingMove.revert()
    setPendingMove(null)
    await editOcc.mutateAsync({
      scope,
      rule_id: ruleId,
      moment_id: momentId,
      occurrence_at: occurrenceAt,
      changes,
    })
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
              {/* Disabled while today is already on screen: a control that
                  can't change anything shouldn't look like it might. */}
              <Button
                variant="secondary"
                size="sm"
                className="ml-1 shrink-0"
                disabled={showsToday}
                title={showsToday ? "Already showing today" : "Jump to today"}
                onClick={() => cal()?.today()}
              >
                Today
              </Button>
            </div>
            <Segmented
              options={VIEWS}
              value={viewType}
              onChange={(v) => cal()?.changeView(v, focusDate())}
            />
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
            plugins={[dayGridPlugin, timeGridPlugin, listPlugin, interactionPlugin]}
            initialView={initialView}
            initialDate={initialDate}
            headerToolbar={false}
            views={{ agenda: AGENDA_VIEW }}
            noEventsText="Nothing scheduled in these 30 days."
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
              const now = new Date()
              setShowsToday(now >= arg.view.activeStart && now < arg.view.activeEnd)
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
              const start = new Date(creating.start)
              if (repeat.everyWeeks > 0) {
                // A series is a **rule**, not a row: its occurrences are
                // computed, and one becomes a moment only when something
                // happens to it. So repeating does not create fifty-two
                // meetings — it creates the reason there are fifty-two.
                const minutes = creating.allDay
                  ? null
                  : Math.round(
                      (new Date(creating.end).getTime() - start.getTime()) / 60000,
                    )
                createSeries.mutate({
                  kind: "occasion",
                  activity: title,
                  timing: [
                    `${String(start.getHours()).padStart(2, "0")}:${String(
                      start.getMinutes(),
                    ).padStart(2, "0")}`,
                  ],
                  days_of_week: repeat.days.length
                    ? repeat.days
                    : [WEEKDAYS[(start.getDay() + 6) % 7]],
                  interval_days: repeat.everyWeeks === 1 ? 1 : repeat.everyWeeks * 7,
                  start_date: dayOfDate(start),
                  end_date: repeat.until || null,
                  expected_minutes: minutes,
                  // The zone the wall-clock slot is in. Without it a 9am series
                  // drifts an hour across a daylight-saving boundary.
                  timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
                })
              } else {
                // The kind is the surface's to declare, never the user's:
                // dragging a range on a calendar says "I had somewhere to be".
                create.mutate({
                  kind: "occasion",
                  title,
                  started_at: creating.start,
                  ended_at: creating.allDay ? null : creating.end,
                  all_day: creating.allDay,
                })
              }
              setRepeat(NO_REPEAT)
              setCreating(null)
            }}
          />
          {/* Below rather than beside: `extra` is an inline slot for one small
              control, and a block in it squeezed the title field to nothing. */}
          <div className="mt-3">
            <RepeatPicker value={repeat} onChange={setRepeat} />
          </div>
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
