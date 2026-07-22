import { CheckCircle2 } from "lucide-react"
import { SimpleEntityPage, type Column } from "@/components/SimpleEntityPage"
import { RefName, StatusBadge } from "@/components/cells"
import { ROUTINE_FIELDS } from "@/services/api/fields"
import { routines, useCompleteRoutine } from "@/services/api/hooks"
import type { Routine } from "@/services/api/types"

const cadence = (r: Routine): string => {
  const parts: string[] = []
  if (r.timing?.length) parts.push(r.timing.join(", "))
  if (r.as_needed) parts.push("PRN")
  else if (r.days_of_week?.length)
    parts.push(r.days_of_week.map((d) => d[0].toUpperCase() + d.slice(1)).join("/"))
  else if (r.interval_days > 1) parts.push(`every ${r.interval_days} days`)
  return parts.join(" · ")
}

export function RoutinesPage() {
  const complete = useCompleteRoutine()
  const columns: Column<Routine>[] = [
    {
      key: "activity",
      label: "Routine",
      render: (r) => (
        <span className="font-medium">
          {r.medication_id ? (
            <RefName kind="medication" id={r.medication_id} />
          ) : (
            (r.activity ?? r.name ?? "—")
          )}
        </span>
      ),
    },
    { key: "cadence", label: "When", render: (r) => <span className="text-slate-500">{cadence(r)}</span> },
    {
      key: "protocol_id",
      label: "In",
      render: (r) =>
        r.protocol_id ? <RefName kind="protocol" id={r.protocol_id} /> : <RefName kind="area" id={r.area_id} />,
    },
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
