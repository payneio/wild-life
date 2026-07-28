import { useState } from "react"
import { CheckCircle2, Repeat } from "lucide-react"
import { summarizeRecurrence } from "@/lib/rrule"
import { Button } from "@/components/ui/primitives"
import { EntityRef } from "@/components/graph/EntityRef"
import { commitments, reviews, useEventPeople } from "@/services/api/hooks"
import { apiClient } from "@/services/api/client"
import { showActionToast } from "@/lib/toast"
import { humanize } from "@/lib/format"
import { useQueryClient } from "@tanstack/react-query"
import type {
  Commitment,
  Entity,
  EventItem,
  Review,
} from "@/services/api/types"
import { AgeTile, DeltaTile, Section, Segmented } from "@/components/detail/kit"
import { formatDate, formatDateTime } from "@/lib/utils"

// --- Event: when & where -----------------------------------------------
export function EventDetail({ entity }: { entity: Entity }) {
  const e = entity as EventItem
  if (!e.start_at) return null
  const start = new Date(e.start_at)
  const end = e.end_at ? new Date(e.end_at) : null
  const sameDay = end != null && start.toDateString() === end.toDateString()
  const timeOpts = { hour: "numeric", minute: "2-digit" } as const
  return (
    <div className="space-y-4">
      {e.event_type && (
        <span className="inline-flex w-fit items-center rounded-full bg-slate-100 px-2 py-0.5 text-xs font-medium text-slate-600">
          {humanize(e.event_type)}
        </span>
      )}
      <div className="rounded-xl border border-slate-200 bg-surface-2 px-4 py-3">
        <div className="text-[11px] font-semibold uppercase tracking-wide text-slate-400">When</div>
        <div className="mt-0.5 text-lg font-semibold text-slate-900">
          {start.toLocaleDateString(undefined, {
            weekday: "long",
            month: "long",
            day: "numeric",
          })}
        </div>
        <div className="text-sm text-slate-500">
          {e.all_day
            ? "All day"
            : `${start.toLocaleTimeString(undefined, timeOpts)}${
                end
                  ? ` – ${sameDay ? end.toLocaleTimeString(undefined, timeOpts) : formatDateTime(e.end_at!)}`
                  : ""
              }`}
        </div>
        {e.recurrence && (
          <div className="mt-1.5 inline-flex items-center gap-1.5 text-xs font-medium text-indigo-600">
            <Repeat size={13} /> {summarizeRecurrence(e.recurrence)}
          </div>
        )}
      </div>
      {/* Sharing — the RSVP control and the guest list — lives on the moment,
          which is what carries the calendar record. This view describes the
          event row, which the calendar no longer opens. */}
      <EventPeople eventId={e.id} attendees={e.attendees} />
    </div>
  )
}

/** Invitees: matched People (navigable chips) + the raw invite emails, always
 *  visible so you can see who's invited even before they're in your CRM. */
function EventPeople({ eventId, attendees }: { eventId: string; attendees: string[] }) {
  const people = useEventPeople(eventId).data ?? []
  const qc = useQueryClient()
  const [busy, setBusy] = useState(false)
  const resync = async () => {
    setBusy(true)
    try {
      const res = await apiClient.post<{ linked: number }>(`/events/${eventId}/reconcile-attendees`, {})
      await qc.invalidateQueries({ queryKey: ["events", eventId, "people"] })
      showActionToast(`Linked ${res.linked} attendee${res.linked === 1 ? "" : "s"} to people`)
    } finally {
      setBusy(false)
    }
  }
  if (people.length === 0 && attendees.length === 0) return null
  return (
    <Section
      title="People"
      action={
        attendees.length > 0 ? (
          <button
            type="button"
            disabled={busy}
            onClick={resync}
            className="rounded-lg px-2 py-1 text-xs font-medium text-slate-500 transition hover:bg-slate-100 hover:text-slate-800 disabled:opacity-50"
          >
            {busy ? "Matching…" : "Match attendees"}
          </button>
        ) : undefined
      }
    >
      {people.length > 0 && (
        <div className="flex flex-wrap gap-1.5">
          {people.map((p) => (
            <EntityRef
              key={p.id}
              type="person"
              id={p.id}
              className="rounded-full bg-indigo-50 px-2 py-0.5 text-xs font-medium text-indigo-700"
            >
              {p.name}
            </EntityRef>
          ))}
        </div>
      )}
      {attendees.length > 0 && (
        <div className="mt-1.5 flex flex-wrap gap-1">
          {attendees.map((a) => (
            <span
              key={a}
              title="Invited"
              className="rounded-full bg-slate-100 px-2 py-0.5 text-[11px] text-slate-500"
            >
              {a}
            </span>
          ))}
        </div>
      )}
    </Section>
  )
}

// --- Commitment: a promise tracker ------------------------------------------
const COMMIT_STATUS: { value: string; label: string }[] = [
  { value: "open", label: "Open" },
  { value: "in_progress", label: "Active" },
  { value: "waiting", label: "Waiting" },
  { value: "fulfilled", label: "Fulfilled" },
  { value: "broken", label: "Broken" },
  { value: "cancelled", label: "Cancelled" },
]

export function CommitmentDetail({ entity }: { entity: Entity }) {
  const c = entity as Commitment
  const update = commitments.useUpdate()
  const set = (body: Record<string, unknown>) => update.mutate({ id: c.id, body })
  return (
    <div className="space-y-5">
      <div className="grid grid-cols-2 gap-2">
        <AgeTile date={c.date_made} label="days ago made" />
        <DeltaTile date={c.due_date} futureLabel="days to due" pastLabel="days overdue" />
      </div>
      <Section title="Status">
        <Segmented options={COMMIT_STATUS} value={c.status} onChange={(v) => set({ status: v })} />
      </Section>
      {c.status !== "fulfilled" && (
        <Button size="sm" onClick={() => set({ status: "fulfilled" })}>
          <CheckCircle2 size={14} /> Mark fulfilled
        </Button>
      )}
    </div>
  )
}

// --- Review: a period record ------------------------------------------------
export function ReviewDetail({ entity }: { entity: Entity }) {
  const r = entity as Review
  const update = reviews.useUpdate()
  const period = [r.period_start, r.period_end].filter(Boolean).map((d) => formatDate(d!))
  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-2">
        {period.length > 0 && (
          <span className="inline-flex items-center gap-1.5 rounded-full bg-slate-100 px-2.5 py-1 text-xs">
            <span className="text-slate-400">Period</span>
            <span className="font-medium text-slate-700">{period.join(" – ")}</span>
          </span>
        )}
        {r.completed_at ? (
          <span className="inline-flex items-center gap-1 rounded-full bg-emerald-100 px-2.5 py-1 text-xs font-medium text-emerald-700">
            <CheckCircle2 size={12} /> Completed {formatDate(r.completed_at)}
          </span>
        ) : (
          <Button
            size="sm"
            onClick={() => update.mutate({ id: r.id, body: { completed_at: new Date().toISOString() } })}
          >
            <CheckCircle2 size={14} /> Mark complete
          </Button>
        )}
      </div>
    </div>
  )
}

