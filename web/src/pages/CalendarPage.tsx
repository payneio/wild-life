import { useMemo, useState } from "react"
import { useNavigate } from "react-router-dom"
import { useQueryClient } from "@tanstack/react-query"
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
import { Button, Modal } from "@/components/ui/primitives"
import { RecurrenceScopeDialog } from "@/components/RecurrenceScopeDialog"
import { events } from "@/services/api/hooks"
import {
  deleteOccurrence,
  editOccurrence,
  type RecurrenceScope,
} from "@/services/calendar/recurrence"
import type { EventItem } from "@/services/api/types"

/** ISO → RFC-5545 basic UTC stamp, e.g. 2026-07-20T17:00:00Z → 20260720T170000Z. */
function toBasicUtc(iso: string): string {
  return new Date(iso).toISOString().replace(/[-:]/g, "").replace(/\.\d{3}/, "")
}

function toEventInput(ev: EventItem): EventInput {
  const base: EventInput = {
    id: ev.id,
    title: ev.title,
    allDay: ev.all_day,
    editable: true,
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

  const inRange = events.useList(
    range.start && range.end
      ? { start_at__gte: range.start, start_at__lte: range.end, limit: "500" }
      : undefined,
  )
  const recurring = events.useList({ recurrence__isnull: "false", limit: "500" })
  const update = events.useUpdate()
  const create = events.useCreate()
  const remove = events.useRemove()

  const invalidate = () => qc.invalidateQueries({ queryKey: ["events"] })

  const fcEvents = useMemo<EventInput[]>(() => {
    const byId = new Map<string, EventItem>()
    for (const e of inRange.data ?? []) byId.set(e.id, e)
    for (const e of recurring.data ?? []) byId.set(e.id, e)
    return [...byId.values()].map(toEventInput)
  }, [inRange.data, recurring.data])

  const moveOrResize = (arg: EventDropArg | EventResizeDoneArg) => {
    const start = arg.event.start
    const end = arg.event.end
    if (!start) return arg.revert()
    const changes: Partial<EventItem> = {
      start_at: start.toISOString(),
      ...(end ? { end_at: end.toISOString() } : {}),
    }
    if (arg.event.extendedProps.recurring) {
      // Recurring: ask which occurrences the move applies to.
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

  const applyMove = async (scope: RecurrenceScope) => {
    if (!pendingMove) return
    const { masterId, occurrenceDate, changes } = pendingMove
    setPendingMove(null)
    pendingMove.revert() // let the react-query refetch render the true result
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
    <div className="rounded-2xl border border-slate-200/80 bg-surface p-3 shadow-soft sm:p-5">
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
        eventClick={(arg: EventClickArg) =>
          setClicked({
            id: arg.event.id,
            title: arg.event.title,
            occurrenceDate: (arg.event.start ?? new Date()).toISOString(),
            recurring: !!arg.event.extendedProps.recurring,
          })
        }
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
                else if (window.confirm("Delete this event?")) {
                  remove.mutate(c.id)
                }
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
