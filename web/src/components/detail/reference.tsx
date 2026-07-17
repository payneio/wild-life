import { CheckCircle2, ExternalLink, MapPin, Repeat } from "lucide-react"
import { summarizeRecurrence } from "@/lib/rrule"
import { Button } from "@/components/ui/primitives"
import { commitments, events, reviews } from "@/services/api/hooks"
import type {
  Commitment,
  Decision,
  Entity,
  EventItem,
  Location,
  Resource,
  Review,
  Tag,
} from "@/services/api/types"
import { AgeTile, DeltaTile, Section, Segmented } from "@/components/detail/kit"
import { formatDate, formatDateTime } from "@/lib/utils"

// --- Decision: the choice, front and center ---------------------------------
export function DecisionDetail({ entity }: { entity: Entity }) {
  const d = entity as Decision
  if (!d.decision && !d.review_date) return null
  return (
    <div className="space-y-3">
      {d.decision && (
        <div className="rounded-xl border-l-4 border-indigo-500 bg-surface-2 px-4 py-3">
          <div className="text-[11px] font-semibold uppercase tracking-wide text-indigo-600">
            Decision
          </div>
          <p className="mt-1 whitespace-pre-wrap text-sm font-medium text-slate-800">
            {d.decision}
          </p>
        </div>
      )}
      {d.review_date && (
        <div className="text-xs text-slate-500">
          Revisit on {formatDate(d.review_date)}
        </div>
      )}
    </div>
  )
}

// --- Resource: open the thing -----------------------------------------------
export function ResourceDetail({ entity }: { entity: Entity }) {
  const r = entity as Resource
  if (!r.url) return null
  return (
    <a
      href={r.url}
      target="_blank"
      rel="noreferrer"
      className="inline-flex items-center gap-2 rounded-lg bg-indigo-600 px-3.5 py-2 text-sm font-medium text-on-accent shadow-sm transition hover:bg-indigo-700"
    >
      <ExternalLink size={15} /> Open resource
    </a>
  )
}

// --- Location: address + map ------------------------------------------------
export function LocationDetail({ entity }: { entity: Entity }) {
  const l = entity as Location
  const parts = [l.address, l.city, l.region].filter(Boolean)
  if (parts.length === 0) return null
  const q = encodeURIComponent(parts.join(", "))
  return (
    <div className="space-y-2">
      <div className="rounded-xl border border-slate-200 bg-surface-2 px-4 py-3 text-sm text-slate-700">
        {l.address && <div>{l.address}</div>}
        {(l.city || l.region) && (
          <div className="text-slate-500">{[l.city, l.region].filter(Boolean).join(", ")}</div>
        )}
      </div>
      <a
        href={`https://www.google.com/maps/search/?api=1&query=${q}`}
        target="_blank"
        rel="noreferrer"
        className="inline-flex items-center gap-1.5 text-sm font-medium text-indigo-600 hover:underline"
      >
        <MapPin size={14} /> Open in Maps
      </a>
    </div>
  )
}

// --- Event: when & where (+ RSVP for emailed invitations) -------------------
const RSVP_OPTIONS: { value: string; label: string }[] = [
  { value: "needs-action", label: "No reply" },
  { value: "accepted", label: "Accept" },
  { value: "tentative", label: "Maybe" },
  { value: "declined", label: "Decline" },
]

export function EventDetail({ entity }: { entity: Entity }) {
  const e = entity as EventItem
  const update = events.useUpdate()
  if (!e.start_at) return null
  const start = new Date(e.start_at)
  const isInvite = !!e.organizer
  return (
    <div className="space-y-4">
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
            : `${start.toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" })}${
                e.end_at ? ` – ${formatDateTime(e.end_at)}` : ""
              }`}
        </div>
        {e.recurrence && (
          <div className="mt-1.5 inline-flex items-center gap-1.5 text-xs font-medium text-indigo-600">
            <Repeat size={13} /> {summarizeRecurrence(e.recurrence)}
          </div>
        )}
      </div>
      {isInvite && (
        <Section title="Invitation">
          <div className="mb-2 text-xs text-slate-500">
            From {e.organizer?.replace(/^mailto:/i, "")}
          </div>
          <Segmented
            options={RSVP_OPTIONS}
            value={e.rsvp_status ?? "needs-action"}
            onChange={(v) => update.mutate({ id: e.id, body: { rsvp_status: v } })}
          />
          <div className="mt-2 text-[11px] text-slate-400">
            {e.rsvp_sent_status === e.rsvp_status && e.rsvp_status !== "needs-action"
              ? "RSVP sent to the organizer"
              : e.rsvp_status && e.rsvp_status !== "needs-action"
                ? "RSVP will be emailed shortly"
                : "Choose a response to notify the organizer"}
          </div>
        </Section>
      )}
    </div>
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

// --- Tag: identity swatch ---------------------------------------------------
export function TagDetail({ entity }: { entity: Entity }) {
  const t = entity as Tag
  if (!t.color) return null
  return (
    <div className="flex items-center gap-3">
      <span
        className="h-10 w-10 rounded-xl border border-slate-200"
        style={{ backgroundColor: t.color }}
      />
      <span className="font-mono text-sm text-slate-500">{t.color}</span>
    </div>
  )
}
