import { useState, type ReactNode } from "react"
import { AffiliationsEditor } from "@/components/AffiliationsEditor"
import { EntityForm, type FieldSpec } from "@/components/EntityForm"
import { Button, EmptyState, Input } from "@/components/ui/primitives"
import { formatDate } from "@/lib/utils"
import { todayISO } from "@/lib/format"
import type { Body } from "@/services/api/crud"
import {
  goals,
  metricEntries,
  metrics,
  programs,
  projects,
  protocolItems,
  routines,
  useMetricEntries,
  useProtocolItems,
} from "@/services/api/hooks"
import type {
  Area,
  Entity,
  Metric,
  MetricEntry,
  Protocol,
  ProtocolItem,
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

// --- Project: next action + tasks -------------------------------------------
function Rollup({ title, items }: { title: string; items: { id: string; label: string }[] }) {
  return (
    <ExtraSection title={`${title} (${items.length})`}>
      {items.length === 0 ? (
        <p className="text-sm text-slate-400">—</p>
      ) : (
        <ul className="space-y-0.5 text-sm text-slate-700">
          {items.map((i) => (
            <li key={i.id}>{i.label}</li>
          ))}
        </ul>
      )}
    </ExtraSection>
  )
}

export function AreaExtra({ entity }: { entity: Entity }) {
  const area = entity as Area
  const byArea = { area_id: area.id }
  const progs = programs.useList(byArea).data ?? []
  const projs = projects.useList(byArea).data ?? []
  const gs = goals.useList(byArea).data ?? []
  const rs = routines.useList(byArea).data ?? []
  const ms = metrics.useList(byArea).data ?? []
  return (
    <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
      <Rollup title="Programs" items={progs.map((p) => ({ id: p.id, label: p.name }))} />
      <Rollup title="Projects" items={projs.map((p) => ({ id: p.id, label: p.name }))} />
      <Rollup title="Goals" items={gs.map((g) => ({ id: g.id, label: g.name }))} />
      <Rollup title="Routines" items={rs.map((r) => ({ id: r.id, label: r.name }))} />
      <Rollup title="Metrics" items={ms.map((m) => ({ id: m.id, label: m.name }))} />
    </div>
  )
}


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

// --- Routine: complete + history --------------------------------------------
const PROTOCOL_ITEM_FIELDS: FieldSpec[] = [
  { name: "substance", label: "Substance" },
  { name: "medication_id", label: "Or link medication", type: "entity", lookup: "medication" },
  { name: "amount", label: "Amount", placeholder: "1" },
  { name: "timing", label: "Timing", type: "tags", full: true, placeholder: "breakfast, dinner" },
  { name: "frequency", label: "Frequency" },
  { name: "trigger", label: "Trigger / condition", full: true },
  { name: "notes", label: "Notes", type: "textarea", full: true },
]

export function ProtocolExtra({ entity }: { entity: Entity }) {
  const protocol = entity as Protocol
  const { data } = useProtocolItems(protocol.id)
  const create = protocolItems.useCreate()
  const update = protocolItems.useUpdate()
  const remove = protocolItems.useRemove()
  const [editing, setEditing] = useState<ProtocolItem | null>(null)
  const [adding, setAdding] = useState(false)
  const list = data ?? []

  function submit(body: Body) {
    if (editing) update.mutate({ id: editing.id, body })
    else create.mutate({ ...body, protocol_id: protocol.id, sort_order: list.length })
    setEditing(null)
    setAdding(false)
  }

  return (
    <ExtraSection title={`Steps (${list.length})`}>
      <div className="space-y-3">
        {list.length === 0 ? (
          <EmptyState>No steps yet.</EmptyState>
        ) : (
          <ul className="space-y-1 text-sm">
            {list.map((it) => (
              <li key={it.id} className="flex items-start justify-between gap-2 border-b border-slate-50 py-1.5">
                <div>
                  <span className="font-medium">{it.substance || "(linked med)"}</span>
                  {it.amount ? <span className="text-slate-400"> · {it.amount}</span> : null}
                  {it.timing?.length ? <span className="text-slate-500"> @ {it.timing.join(", ")}</span> : null}
                  {it.trigger ? <div className="text-xs text-amber-600">{it.trigger}</div> : null}
                </div>
                <div className="whitespace-nowrap">
                  <button className="rounded px-1 text-xs text-slate-400 hover:text-slate-700" onClick={() => { setEditing(it); setAdding(false) }}>
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
        {adding || editing ? (
          <EntityForm
            fields={PROTOCOL_ITEM_FIELDS}
            initial={editing ?? undefined}
            onSubmit={submit}
            onCancel={() => { setEditing(null); setAdding(false) }}
            submitLabel={editing ? "Save" : "Add step"}
          />
        ) : (
          <Button variant="secondary" onClick={() => setAdding(true)}>
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
