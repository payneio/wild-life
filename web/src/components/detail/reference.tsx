import { CheckCircle2 } from "lucide-react"
import { Button } from "@/components/ui/primitives"
import { commitments, reviews } from "@/services/api/hooks"
import type { Commitment, Entity, Review } from "@/services/api/types"
import { AgeTile, DeltaTile, Section, Segmented } from "@/components/detail/kit"
import { formatDate } from "@/lib/utils"


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

