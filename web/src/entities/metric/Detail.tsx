import { Record, RecordSection } from "@/components/record/Record"
import { MetricExtra } from "@/components/detailExtras"
import { recordFields } from "@/components/record/typed"
import { FREQUENCY_LABEL, MEASUREMENT_FREQUENCIES } from "@/services/api/enums"
import { REGISTRY } from "@/services/api/registry"
import type { Entity, MeasurementFrequency, Metric } from "@/services/api/types"

const F = recordFields<Metric>()

export function MetricDetail({ entity, onClose }: { entity: Entity; onClose: () => void }) {
  return (
    <Record def={REGISTRY.metric} entity={entity} onClose={onClose}>
      <RecordSection>
        <F.Title field="name" placeholder="Metric name" />
        <F.Text field="unit" label="Unit" placeholder="kg, hours, count" />
        {/* Reads as a sentence — "Remind me if no reading for: a week" — because
            the only thing this field does is put the metric on the review
            dashboard's overdue list. Blank (the "—" option) means never. */}
        <F.Select
          field="measurement_frequency"
          label="Remind me if no reading for"
          options={MEASUREMENT_FREQUENCIES}
          optionLabel={(o) => FREQUENCY_LABEL[o as MeasurementFrequency]}
        />
      </RecordSection>

      {/* The externally defined normal band — a lab range, a guideline. What
          *I* am aiming for is a claim, and claims live on an Outcome. */}
      <RecordSection title="Normal range">
        <F.Number field="reference_min" label="Normal from" />
        <F.Number field="reference_max" label="Normal to" />
      </RecordSection>

      {/* Entries + trend — the reason you open a metric at all. */}
      <MetricExtra entity={entity} />

      <RecordSection title="Context">
        {/* One root: what this measures. It replaced an area/program/condition
            triple that let two readings of the same kind be filed differently. */}
        <F.Root label="Measures" />
        <F.Text field="data_source" label="Data source" />
        <F.Textarea field="notes" label="Notes" />
      </RecordSection>
    </Record>
  )
}
