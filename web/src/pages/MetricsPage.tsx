import { useState } from "react"
import { LineChart } from "lucide-react"
import { SimpleEntityPage, type Column } from "@/components/SimpleEntityPage"
import { EntityForm, type FieldSpec } from "@/components/EntityForm"
import { RefName } from "@/components/cells"
import { Button, EmptyState, Modal } from "@/components/ui/primitives"
import { formatDate } from "@/lib/utils"
import { metricEntries, metrics, useMetricEntries } from "@/services/api/hooks"
import type { Body } from "@/services/api/crud"
import type { Metric, MetricEntry } from "@/services/api/types"

const FIELDS: FieldSpec[] = [
  { name: "name", label: "Name" },
  { name: "unit", label: "Unit" },
  { name: "area_id", label: "Area", type: "entity", lookup: "area" },
  { name: "target_value", label: "Target", type: "number" },
  { name: "target_min", label: "Target min", type: "number" },
  { name: "target_max", label: "Target max", type: "number" },
  { name: "measurement_frequency", label: "Frequency" },
  { name: "data_source", label: "Data source" },
  { name: "notes", label: "Notes", type: "textarea", full: true },
]

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

function EntriesModal({ metric, onClose }: { metric: Metric; onClose: () => void }) {
  const { data } = useMetricEntries(metric.id)
  const create = metricEntries.useCreate()
  const [adding, setAdding] = useState(false)
  const list = data ?? []
  return (
    <Modal title={`${metric.name} — trend`} onClose={onClose}>
      <div className="space-y-3">
        <Sparkline entries={list} />
        {list.length === 0 ? (
          <EmptyState>No entries yet.</EmptyState>
        ) : (
          <ul className="max-h-48 space-y-1 overflow-y-auto text-sm">
            {[...list]
              .sort((a, b) => b.entry_date.localeCompare(a.entry_date))
              .map((e) => (
                <li key={e.id} className="flex justify-between border-b border-slate-50 py-1">
                  <span className="text-slate-500">{formatDate(e.entry_date)}</span>
                  <span className="font-medium">
                    {e.value}
                    {metric.unit ? ` ${metric.unit}` : ""}
                  </span>
                </li>
              ))}
          </ul>
        )}
        {adding ? (
          <EntityForm
            fields={[
              { name: "entry_date", label: "Date", type: "date" },
              { name: "value", label: "Value", type: "number" },
              { name: "notes", label: "Notes", full: true },
            ]}
            onSubmit={(body: Body) => {
              create.mutate({ ...body, metric_id: metric.id })
              setAdding(false)
            }}
            onCancel={() => setAdding(false)}
            submitLabel="Add"
          />
        ) : (
          <Button variant="secondary" onClick={() => setAdding(true)}>
            Add entry
          </Button>
        )}
      </div>
    </Modal>
  )
}

export function MetricsPage() {
  const [selected, setSelected] = useState<Metric | null>(null)
  const columns: Column<Metric>[] = [
    { key: "name", label: "Metric", render: (r) => <span className="font-medium">{r.name}</span> },
    { key: "unit", label: "Unit" },
    { key: "target_value", label: "Target", render: (r) => r.target_value ?? "—" },
    { key: "area_id", label: "Area", render: (r) => <RefName kind="area" id={r.area_id} /> },
  ]
  return (
    <>
      <SimpleEntityPage
        title="Metrics"
        subtitle="Measurable variables tracked over time"
        crud={metrics}
        fields={FIELDS}
        columns={columns}
        rowActions={(row) => (
          <button
            className="ml-1 rounded p-1 text-slate-400 hover:bg-slate-100 hover:text-slate-700"
            title="Trend"
            onClick={() => setSelected(row)}
          >
            <LineChart size={15} />
          </button>
        )}
      />
      {selected && <EntriesModal metric={selected} onClose={() => setSelected(null)} />}
    </>
  )
}
