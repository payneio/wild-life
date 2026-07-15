import { useState } from "react"
import { CheckCircle2, History } from "lucide-react"
import { SimpleEntityPage, type Column } from "@/components/SimpleEntityPage"
import { RefName, StatusBadge } from "@/components/cells"
import { EmptyState, Modal } from "@/components/ui/primitives"
import { formatDate } from "@/lib/utils"
import type { FieldSpec } from "@/components/EntityForm"
import { routines, useCompleteRoutine, useRoutineInstances } from "@/services/api/hooks"
import type { Routine } from "@/services/api/types"

const FIELDS: FieldSpec[] = [
  { name: "name", label: "Name", full: true },
  { name: "area_id", label: "Area", type: "entity", lookup: "area" },
  { name: "frequency", label: "Frequency", placeholder: "daily / weekly / 3x-week" },
  { name: "preferred_days", label: "Preferred days", type: "tags", placeholder: "Mon, Wed, Fri" },
  { name: "preferred_time", label: "Preferred time" },
  { name: "tracking_method", label: "Tracking method" },
  { name: "status", label: "Status", type: "select", options: ["active", "paused", "archived"] },
  { name: "start_date", label: "Start", type: "date" },
  { name: "end_date", label: "End", type: "date" },
  { name: "responsible_id", label: "Responsible", type: "entity", lookup: "people" },
  { name: "notes", label: "Notes", type: "textarea", full: true },
]

function InstancesModal({ routine, onClose }: { routine: Routine; onClose: () => void }) {
  const { data } = useRoutineInstances(routine.id)
  const list = data ?? []
  const done = list.filter((i) => i.status === "done").length
  return (
    <Modal title={`${routine.name} — history`} onClose={onClose}>
      <p className="mb-2 text-sm text-slate-500">{done} completions logged.</p>
      {list.length === 0 ? (
        <EmptyState>No completions yet.</EmptyState>
      ) : (
        <ul className="max-h-64 space-y-1 overflow-y-auto text-sm">
          {list.map((i) => (
            <li key={i.id} className="flex justify-between border-b border-slate-50 py-1">
              <span>{formatDate(i.scheduled_date)}</span>
              <StatusBadge status={i.status} />
            </li>
          ))}
        </ul>
      )}
    </Modal>
  )
}

export function RoutinesPage() {
  const [selected, setSelected] = useState<Routine | null>(null)
  const complete = useCompleteRoutine()
  const columns: Column<Routine>[] = [
    { key: "name", label: "Routine", render: (r) => <span className="font-medium">{r.name}</span> },
    { key: "frequency", label: "Frequency" },
    { key: "area_id", label: "Area", render: (r) => <RefName kind="area" id={r.area_id} /> },
    { key: "status", label: "Status", render: (r) => <StatusBadge status={r.status} /> },
  ]
  return (
    <>
      <SimpleEntityPage
        title="Routines"
        subtitle="Recurring behaviors and maintenance"
        crud={routines}
        fields={FIELDS}
        columns={columns}
        rowActions={(row) => (
          <>
            <button
              className="ml-1 rounded p-1 text-emerald-500 hover:bg-emerald-50"
              title="Log completion (today)"
              onClick={() => complete.mutate({ id: row.id })}
            >
              <CheckCircle2 size={16} />
            </button>
            <button
              className="ml-1 rounded p-1 text-slate-400 hover:bg-slate-100 hover:text-slate-700"
              title="History"
              onClick={() => setSelected(row)}
            >
              <History size={15} />
            </button>
          </>
        )}
      />
      {selected && <InstancesModal routine={selected} onClose={() => setSelected(null)} />}
    </>
  )
}
