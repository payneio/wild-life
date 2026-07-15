import { useState } from "react"
import { PanelRight } from "lucide-react"
import { SimpleEntityPage, type Column } from "@/components/SimpleEntityPage"
import { RefName, StatusBadge } from "@/components/cells"
import { Modal } from "@/components/ui/primitives"
import type { FieldSpec } from "@/components/EntityForm"
import { areas, goals, metrics, programs, projects, routines } from "@/services/api/hooks"
import type { Area } from "@/services/api/types"

const FIELDS: FieldSpec[] = [
  { name: "name", label: "Name" },
  { name: "status", label: "Status", type: "select", options: ["active", "inactive", "archived"] },
  { name: "desired_standard", label: "Desired standard", type: "textarea", full: true },
  { name: "review_frequency", label: "Review frequency", placeholder: "weekly / monthly" },
  { name: "accountable_owner_id", label: "Accountable owner", type: "entity", lookup: "people" },
  { name: "description", label: "Description", type: "textarea", full: true },
  { name: "notes", label: "Notes", type: "textarea", full: true },
]

function Section({ title, items }: { title: string; items: { id: string; label: string }[] }) {
  return (
    <div>
      <h3 className="mb-1 text-xs font-semibold uppercase tracking-wide text-slate-400">
        {title} ({items.length})
      </h3>
      {items.length === 0 ? (
        <p className="text-sm text-slate-400">—</p>
      ) : (
        <ul className="space-y-0.5 text-sm text-slate-700">
          {items.map((i) => (
            <li key={i.id}>{i.label}</li>
          ))}
        </ul>
      )}
    </div>
  )
}

function AreaDetail({ area, onClose }: { area: Area; onClose: () => void }) {
  const byArea = { area_id: area.id }
  const progs = programs.useList(byArea).data ?? []
  const projs = projects.useList(byArea).data ?? []
  const gs = goals.useList(byArea).data ?? []
  const rs = routines.useList(byArea).data ?? []
  const ms = metrics.useList(byArea).data ?? []
  return (
    <Modal title={area.name} onClose={onClose}>
      <div className="grid grid-cols-2 gap-4">
        <Section title="Programs" items={progs.map((p) => ({ id: p.id, label: p.name }))} />
        <Section title="Projects" items={projs.map((p) => ({ id: p.id, label: p.name }))} />
        <Section title="Goals" items={gs.map((g) => ({ id: g.id, label: g.name }))} />
        <Section title="Routines" items={rs.map((r) => ({ id: r.id, label: r.name }))} />
        <Section title="Metrics" items={ms.map((m) => ({ id: m.id, label: m.name }))} />
      </div>
    </Modal>
  )
}

export function AreasPage() {
  const [selected, setSelected] = useState<Area | null>(null)
  const columns: Column<Area>[] = [
    { key: "name", label: "Area", render: (r) => <span className="font-medium">{r.name}</span> },
    { key: "status", label: "Status", render: (r) => <StatusBadge status={r.status} /> },
    { key: "review_frequency", label: "Review" },
    { key: "accountable_owner_id", label: "Owner", render: (r) => <RefName kind="people" id={r.accountable_owner_id} /> },
  ]
  return (
    <>
      <SimpleEntityPage
        title="Areas"
        subtitle="Ongoing spheres of responsibility"
        crud={areas}
        fields={FIELDS}
        columns={columns}
        emptyText="No areas yet. Areas are your standing responsibilities (Health, Finances, Home…)."
        rowActions={(row) => (
          <button
            className="ml-1 rounded p-1 text-slate-400 hover:bg-slate-100 hover:text-slate-700"
            title="Overview"
            onClick={() => setSelected(row)}
          >
            <PanelRight size={15} />
          </button>
        )}
      />
      {selected && <AreaDetail area={selected} onClose={() => setSelected(null)} />}
    </>
  )
}
