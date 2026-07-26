import { SimpleEntityPage, type Column } from "@/components/SimpleEntityPage"
import { RefName } from "@/components/cells"
import { formatBand } from "@/lib/format"
import { METRIC_FIELDS } from "@/services/api/fields"
import { metrics } from "@/services/api/hooks"
import type { Metric } from "@/services/api/types"

export function MetricsPage() {
  const columns: Column<Metric>[] = [
    { key: "name", label: "Metric", render: (r) => <span className="font-medium">{r.name}</span> },
    { key: "unit", label: "Unit" },
    { key: "reference_max", label: "Normal", render: (r) => formatBand(r.reference_min, r.reference_max) ?? "—" },
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
