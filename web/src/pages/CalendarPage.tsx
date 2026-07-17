import { useMemo, useState } from "react"
import { useNavigate } from "react-router-dom"
import FullCalendar from "@fullcalendar/react"
import dayGridPlugin from "@fullcalendar/daygrid"
import timeGridPlugin from "@fullcalendar/timegrid"
import interactionPlugin from "@fullcalendar/interaction"
import rrulePlugin from "@fullcalendar/rrule"
import type {
  DateSelectArg,
  DatesSetArg,
  EventClickArg,
  EventDropArg,
  EventInput,
} from "@fullcalendar/core"
import type { EventResizeDoneArg } from "@fullcalendar/interaction"
import { events } from "@/services/api/hooks"
import type { EventItem } from "@/services/api/types"

/** ISO → RFC-5545 basic UTC stamp, e.g. 2026-07-20T17:00:00Z → 20260720T170000Z. */
function toBasicUtc(iso: string): string {
  return new Date(iso).toISOString().replace(/[-:]/g, "").replace(/\.\d{3}/, "")
}

/** Map a personal-api Event to a FullCalendar event, expanding recurrence. */
function toEventInput(ev: EventItem): EventInput {
  const base: EventInput = {
    id: ev.id,
    title: ev.title,
    allDay: ev.all_day,
    // Occurrences of a series aren't individually draggable (would desync the
    // master); single events are freely movable.
    editable: !ev.recurrence,
    extendedProps: { recurring: !!ev.recurrence },
  }
  if (ev.recurrence) {
    base.rrule = `DTSTART:${toBasicUtc(ev.start_at)}\nRRULE:${ev.recurrence}`
    if (ev.end_at) {
      base.duration = new Date(ev.end_at).getTime() - new Date(ev.start_at).getTime()
    }
    if (ev.recurrence_exdates?.length) base.exdate = ev.recurrence_exdates
  } else {
    base.start = ev.start_at
    if (ev.end_at) base.end = ev.end_at
  }
  return base
}

export function CalendarPage() {
  const navigate = useNavigate()
  const [range, setRange] = useState<{ start?: string; end?: string }>({})

  // In-range single events + all recurring masters (their start may predate the
  // window, so a plain start_at range filter would miss them). Merged by id.
  const inRange = events.useList(
    range.start && range.end
      ? { start_at__gte: range.start, start_at__lte: range.end, limit: "500" }
      : undefined,
  )
  const recurring = events.useList({ recurrence__isnull: "false", limit: "500" })
  const update = events.useUpdate()
  const create = events.useCreate()

  const fcEvents = useMemo<EventInput[]>(() => {
    const byId = new Map<string, EventItem>()
    for (const e of inRange.data ?? []) byId.set(e.id, e)
    for (const e of recurring.data ?? []) byId.set(e.id, e)
    return [...byId.values()].map(toEventInput)
  }, [inRange.data, recurring.data])

  const moveOrResize = (arg: EventDropArg | EventResizeDoneArg) => {
    const start = arg.event.start
    const end = arg.event.end
    if (!start) {
      arg.revert()
      return
    }
    update.mutate({
      id: arg.event.id,
      body: {
        start_at: start.toISOString(),
        ...(end ? { end_at: end.toISOString() } : {}),
      },
    })
  }

  return (
    <div className="rounded-xl bg-surface p-3 shadow-sm sm:p-5">
      <FullCalendar
        plugins={[dayGridPlugin, timeGridPlugin, interactionPlugin, rrulePlugin]}
        initialView="dayGridMonth"
        headerToolbar={{
          left: "prev,next today",
          center: "title",
          right: "dayGridMonth,timeGridWeek,timeGridDay",
        }}
        height="auto"
        nowIndicator
        selectable
        editable
        dayMaxEvents
        events={fcEvents}
        datesSet={(arg: DatesSetArg) =>
          setRange({ start: arg.start.toISOString(), end: arg.end.toISOString() })
        }
        eventClick={(arg: EventClickArg) => navigate(`/events/${arg.event.id}`)}
        select={(arg: DateSelectArg) => {
          const title = window.prompt("New event title")?.trim()
          if (!title) return
          create.mutate({
            title,
            start_at: arg.start.toISOString(),
            end_at: arg.allDay ? null : arg.end.toISOString(),
            all_day: arg.allDay,
          })
        }}
        eventDrop={moveOrResize}
        eventResize={moveOrResize}
      />
    </div>
  )
}
