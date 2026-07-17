import { SimpleEntityPage, type Column } from "@/components/SimpleEntityPage"
import { RefName } from "@/components/cells"
import { METRIC_FIELDS } from "@/services/api/fields"
import { metrics } from "@/services/api/hooks"
import type { Metric } from "@/services/api/types"

export function MetricsPage() {
  const columns: Column<Metric>[] = [
    { key: "name", label: "Metric", render: (r) => <span className="font-medium">{r.name}</span> },
    { key: "unit", label: "Unit" },
    { key: "target_value", label: "Target", render: (r) => r.target_value ?? "—" },
    { key: "area_id", label: "Area", render: (r) => <RefName kind="area" id={r.area_id} /> },
  ]
  return (
    <SimpleEntityPage
      title="Metrics"
      subtitle="Measurable variables tracked over time"
      crud={metrics}
      fields={METRIC_FIELDS}
      columns={columns}
    />
  )
}
