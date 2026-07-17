import { CheckCircle2 } from "lucide-react"
import { SimpleEntityPage, type Column } from "@/components/SimpleEntityPage"
import { RefName, StatusBadge } from "@/components/cells"
import { ROUTINE_FIELDS } from "@/services/api/fields"
import { routines, useCompleteRoutine } from "@/services/api/hooks"
import type { Routine } from "@/services/api/types"

export function RoutinesPage() {
  const complete = useCompleteRoutine()
  const columns: Column<Routine>[] = [
    { key: "name", label: "Routine", render: (r) => <span className="font-medium">{r.name}</span> },
    { key: "frequency", label: "Frequency" },
    { key: "area_id", label: "Area", render: (r) => <RefName kind="area" id={r.area_id} /> },
    { key: "status", label: "Status", render: (r) => <StatusBadge status={r.status} /> },
  ]
  return (
    <SimpleEntityPage
      title="Routines"
      subtitle="Recurring behaviors and maintenance"
      crud={routines}
      fields={ROUTINE_FIELDS}
      columns={columns}
      rowActions={(row) => (
        <button
          className="rounded p-1 text-emerald-500 hover:bg-emerald-50"
          title="Log completion (today)"
          onClick={() => complete.mutate({ id: row.id })}
        >
          <CheckCircle2 size={16} />
        </button>
      )}
    />
  )
}
