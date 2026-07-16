import { CheckCircle2, Clock } from "lucide-react"
import { Button } from "@/components/ui/primitives"
import { StatusBadge } from "@/components/cells"
import { delegations, waitingItems } from "@/services/api/hooks"
import type { Delegation, Entity, Priority, WaitingItem } from "@/services/api/types"
import { AgeTile, DeltaTile, Section, Segmented, StatTile } from "@/components/detail/kit"
import { shiftDays } from "@/components/detail/dates"

const WAITING_STATUS: { value: string; label: string }[] = [
  { value: "open", label: "Open" },
  { value: "received", label: "Received" },
  { value: "overdue", label: "Overdue" },
  { value: "cancelled", label: "Cancelled" },
]

const DELEGATION_STATUS = [
  "draft", "requested", "accepted", "in_progress", "waiting_for_update", "blocked",
  "delivered", "revision_requested", "accepted_as_complete", "declined", "reassigned", "cancelled",
]

const PRIORITY_STEPS: { value: Priority; label: string }[] = [
  { value: "low", label: "Low" },
  { value: "medium", label: "Med" },
  { value: "high", label: "High" },
  { value: "urgent", label: "Urgent" },
]

/** A row of quick "snooze the follow-up" buttons. */
function SnoozeRow({ onSet }: { onSet: (iso: string) => void }) {
  const opts: [string, number][] = [
    ["+3 days", 3],
    ["+1 week", 7],
    ["+2 weeks", 14],
  ]
  return (
    <div className="flex flex-wrap items-center gap-1.5">
      {opts.map(([label, n]) => (
        <button
          key={label}
          onClick={() => onSet(shiftDays(n))}
          className="rounded-full bg-slate-100 px-2.5 py-1 text-xs font-medium text-slate-600 transition hover:bg-slate-200"
        >
          {label}
        </button>
      ))}
    </div>
  )
}

// --- Waiting item: a follow-up cockpit --------------------------------------
export function WaitingDetail({ entity }: { entity: Entity }) {
  const w = entity as WaitingItem
  const update = waitingItems.useUpdate()
  const set = (body: Record<string, unknown>) => update.mutate({ id: w.id, body })
  return (
    <div className="space-y-5">
      <div className="grid grid-cols-3 gap-2">
        <AgeTile date={w.date_requested} label="days waiting" />
        <DeltaTile date={w.expected_date} futureLabel="days to expected" pastLabel="days overdue" />
        <DeltaTile date={w.follow_up_date} futureLabel="to follow-up" pastLabel="follow-up due" />
      </div>

      <Section title="Status">
        <Segmented options={WAITING_STATUS} value={w.status} onChange={(v) => set({ status: v })} />
      </Section>

      <Section title="Follow-up">
        <div className="flex flex-wrap items-center gap-2">
          {w.status !== "received" && (
            <Button size="sm" onClick={() => set({ status: "received" })}>
              <CheckCircle2 size={14} /> Mark received
            </Button>
          )}
          <span className="text-xs text-slate-400">Snooze:</span>
          <SnoozeRow onSet={(iso) => set({ follow_up_date: iso })} />
        </div>
      </Section>
    </div>
  )
}

// --- Delegation: an accountability tracker ----------------------------------
export function DelegationDetail({ entity }: { entity: Entity }) {
  const d = entity as Delegation
  const update = delegations.useUpdate()
  const set = (body: Record<string, unknown>) => update.mutate({ id: d.id, body })
  return (
    <div className="space-y-5">
      <div className="grid grid-cols-3 gap-2">
        <AgeTile date={d.date_delegated} label="days out" />
        <DeltaTile date={d.expected_completion_date} futureLabel="days to due" pastLabel="days overdue" />
        <StatTile
          value={d.escalation_level}
          label="escalation"
          tone={d.escalation_level > 0 ? "danger" : "muted"}
        />
      </div>

      <Section title="Status" action={<StatusBadge status={d.status} />}>
        <select
          value={d.status}
          onChange={(e) => set({ status: e.target.value })}
          className="w-full rounded-lg border border-slate-300 bg-surface px-3 py-1.5 text-sm text-slate-700 capitalize"
        >
          {DELEGATION_STATUS.map((s) => (
            <option key={s} value={s}>
              {s.replace(/_/g, " ")}
            </option>
          ))}
        </select>
      </Section>

      <Section title="Priority">
        <Segmented
          options={PRIORITY_STEPS}
          value={d.priority}
          onChange={(v) => set({ priority: v })}
        />
      </Section>

      <Section title="Follow-up">
        <div className="flex flex-wrap items-center gap-2">
          <Button
            variant="secondary"
            size="sm"
            onClick={() => set({ last_contact_date: shiftDays(0) })}
          >
            <Clock size={14} /> Logged contact today
          </Button>
          <SnoozeRow onSet={(iso) => set({ follow_up_date: iso })} />
        </div>
      </Section>
    </div>
  )
}
