import { SimpleEntityPage, type Column } from "@/components/SimpleEntityPage"
import { RefName, StatusBadge } from "@/components/cells"
import { AREA_FIELDS } from "@/services/api/fields"
import { areas } from "@/services/api/hooks"
import type { Area } from "@/services/api/types"

export function AreasPage() {
  const columns: Column<Area>[] = [
    { key: "name", label: "Area", render: (r) => <span className="font-medium">{r.name}</span> },
    { key: "status", label: "Status", render: (r) => <StatusBadge status={r.status} /> },
    { key: "review_frequency", label: "Review" },
    { key: "accountable_owner_id", label: "Owner", render: (r) => <RefName kind="people" id={r.accountable_owner_id} /> },
  ]
  return (
    <SimpleEntityPage
      title="Areas"
      subtitle="Ongoing spheres of responsibility"
      crud={areas}
      fields={AREA_FIELDS}
      columns={columns}
      detail="page"
      emptyText="No areas yet. Areas are your standing responsibilities (Health, Finances, Home…)."
    />
  )
}
