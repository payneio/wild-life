import { useState, type ReactNode } from "react"
import { AffiliationsEditor } from "@/components/AffiliationsEditor"
import { EntityForm } from "@/components/EntityForm"
import { RefName } from "@/components/cells"
import { Button, EmptyState, Input } from "@/components/ui/primitives"
import { cn, formatDate } from "@/lib/utils"
import { todayISO } from "@/lib/format"
import type { Body } from "@/services/api/crud"
import { ACTIVITY_STEP_FIELDS, MED_STEP_FIELDS } from "@/services/api/fields"
import { metricEntries, routines, useMetricEntries } from "@/services/api/hooks"
import type {
  Entity,
  Metric,
  MetricEntry,
  Protocol,
  Routine,
} from "@/services/api/types"

function ExtraSection({ title, children }: { title: string; children: ReactNode }) {
  return (
    <div>
      <h3 className="mb-1.5 text-xs font-semibold uppercase tracking-wide text-slate-400">
        {title}
      </h3>
      {children}
    </div>
  )
}

// Area's child collections (programs/projects/goals/routines/metrics) are now
// rendered by the generic RelatedPanel from `area.relations` — navigable and
// with inline add/create — so AreaExtra is gone.

function Sparkline({ entries }: { entries: MetricEntry[] }) {
  if (entries.length < 2) return null
  const sorted = [...entries].sort((a, b) => a.entry_date.localeCompare(b.entry_date))
  const vals = sorted.map((e) => e.value)
  const min = Math.min(...vals)
  const max = Math.max(...vals)
  const span = max - min || 1
  const w = 240
  const h = 40
  const pts = sorted
    .map((e, i) => {
      const x = (i / (sorted.length - 1)) * w
      const y = h - ((e.value - min) / span) * h
      return `${x.toFixed(1)},${y.toFixed(1)}`
    })
    .join(" ")
  return (
    <svg width={w} height={h} className="text-indigo-500">
      <polyline points={pts} fill="none" stroke="currentColor" strokeWidth={1.5} />
    </svg>
  )
}

export function MetricExtra({ entity }: { entity: Entity }) {
  const metric = entity as Metric
  const { data } = useMetricEntries(metric.id)
  const create = metricEntries.useCreate()
  const [value, setValue] = useState("")
  const [date, setDate] = useState("")
  const list = data ?? []
  const recent = [...list].sort((a, b) => b.entry_date.localeCompare(a.entry_date))
  return (
    <div className="space-y-3">
      <ExtraSection title="Trend">
        {list.length < 2 ? <p className="text-sm text-slate-400">Need ≥2 entries.</p> : <Sparkline entries={list} />}
      </ExtraSection>
      <div className="flex gap-2">
        <Input type="date" value={date} onChange={(e) => setDate(e.target.value)} />
        <Input
          type="number"
          placeholder={metric.unit ?? "value"}
          value={value}
          onChange={(e) => setValue(e.target.value)}
        />
        <Button
          variant="secondary"
          onClick={() => {
            if (value) {
              create.mutate({
                metric_id: metric.id,
                value: Number(value),
                entry_date: date || todayISO(),
              })
              setValue("")
              setDate("")
            }
          }}
        >
          Add
        </Button>
      </div>
      <ExtraSection title={`Entries (${list.length})`}>
        {list.length === 0 ? (
          <p className="text-sm text-slate-400">No entries yet.</p>
        ) : (
          <ul className="max-h-48 space-y-1 overflow-y-auto text-sm">
            {recent.map((e) => (
              <li key={e.id} className="flex justify-between border-b border-slate-50 py-1">
                <span>{formatDate(e.entry_date)}</span>
                <span className="font-medium">
                  {e.value}
                  {metric.unit ? ` ${metric.unit}` : ""}
                </span>
              </li>
            ))}
          </ul>
        )}
      </ExtraSection>
    </div>
  )
}

// --- Protocol: dosed + behavioral steps -------------------------------------
// A step is *either* a medication (a cataloged drug/OTC/supplement you track and
// can check off) *or* an activity (a behavior like "walk after dinner"). The
// toggle picks one so you never fill both.
type StepMode = "medication" | "activity"

// One-line "when" summary for a routine: times of day + cadence.
function stepMeta(it: Routine): string {
  const parts: string[] = []
  if (it.timing?.length) parts.push(`@ ${it.timing.join(", ")}`)
  if (it.days_of_week?.length)
    parts.push(it.days_of_week.map((d) => d[0].toUpperCase() + d.slice(1)).join("/"))
  else if (it.interval_days > 1) parts.push(`every ${it.interval_days} days`)
  return parts.join(" · ")
}

export function ProtocolExtra({ entity }: { entity: Entity }) {
  const protocol = entity as Protocol
  const { data } = routines.useList({
    protocol_id__eq: protocol.id,
    sort: "sort_order",
    limit: "200",
  })
  const create = routines.useCreate()
  const update = routines.useUpdate()
  const remove = routines.useRemove()
  const [editing, setEditing] = useState<Routine | null>(null)
  const [adding, setAdding] = useState(false)
  const [mode, setMode] = useState<StepMode>("medication")
  const list = data ?? []
  const open = adding || !!editing

  function startAdd() {
    setAdding(true)
    setEditing(null)
    setMode("medication")
  }
  function startEdit(it: Routine) {
    setEditing(it)
    setAdding(false)
    setMode(it.medication_id ? "medication" : "activity")
  }
  function close() {
    setEditing(null)
    setAdding(false)
  }

  function submit(body: Body) {
    // A step is one kind or the other — clear whichever field this mode drops.
    const kind =
      mode === "medication"
        ? { ...body, activity: null }
        : { ...body, medication_id: null }
    const patch = { ...kind, interval_days: (body.interval_days as number) || 1 }
    if (editing) update.mutate({ id: editing.id, body: patch })
    else create.mutate({ ...patch, protocol_id: protocol.id, sort_order: list.length })
    close()
  }

  return (
    <ExtraSection title={`Steps (${list.length})`}>
      <div className="space-y-3">
        {list.length === 0 && !open ? (
          <EmptyState>No steps yet.</EmptyState>
        ) : (
          <ul className="space-y-1 text-sm">
            {list.map((it) => (
              <li key={it.id} className="flex items-start justify-between gap-2 border-b border-slate-50 py-1.5">
                <div>
                  {it.medication_id ? (
                    <span className="font-medium">
                      <RefName kind="medication" id={it.medication_id} />
                    </span>
                  ) : it.activity ? (
                    <span className="font-medium">{it.activity}</span>
                  ) : (
                    <span className="font-medium text-slate-400">(step)</span>
                  )}
                  {it.amount != null ? (
                    <span className="text-slate-400">
                      {" "}
                      · {it.amount}
                      {it.unit ? ` ${it.unit}` : ""}
                    </span>
                  ) : null}
                  {stepMeta(it) ? <span className="text-slate-500"> {stepMeta(it)}</span> : null}
                </div>
                <div className="whitespace-nowrap">
                  <button className="rounded px-1 text-xs text-slate-400 hover:text-slate-700" onClick={() => startEdit(it)}>
                    edit
                  </button>
                  <button className="rounded px-1 text-xs text-slate-400 hover:text-red-600" onClick={() => remove.mutate(it.id)}>
                    delete
                  </button>
                </div>
              </li>
            ))}
          </ul>
        )}
        {open ? (
          <div className="space-y-2">
            <div className="inline-flex rounded-lg border border-slate-200 p-0.5 text-xs">
              {(["medication", "activity"] as const).map((m) => (
                <button
                  key={m}
                  type="button"
                  onClick={() => setMode(m)}
                  className={cn(
                    "rounded-md px-2.5 py-1 font-medium capitalize",
                    mode === m ? "bg-indigo-600 text-on-accent" : "text-slate-500 hover:text-slate-700",
                  )}
                >
                  {m}
                </button>
              ))}
            </div>
            <EntityForm
              key={editing?.id ?? "new"}
              fields={mode === "medication" ? MED_STEP_FIELDS : ACTIVITY_STEP_FIELDS}
              initial={editing ?? undefined}
              onSubmit={submit}
              onCancel={close}
              submitLabel={editing ? "Save" : "Add step"}
            />
          </div>
        ) : (
          <Button variant="secondary" onClick={startAdd}>
            Add step
          </Button>
        )}
      </div>
    </ExtraSection>
  )
}

// --- Organization: members --------------------------------------------------
export function OrganizationExtra({ entity }: { entity: Entity }) {
  return (
    <ExtraSection title="Members">
      <AffiliationsEditor organizationId={entity.id} />
    </ExtraSection>
  )
}
