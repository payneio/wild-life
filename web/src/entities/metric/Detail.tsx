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

      <RecordSection title="Target">
        <F.Number field="target_value" label="Target" />
        <F.Number field="target_min" label="Min" />
        <F.Number field="target_max" label="Max" />
      </RecordSection>

      {/* Entries + trend — the reason you open a metric at all. */}
      <MetricExtra entity={entity} />

      <RecordSection title="Context">
        <F.Ref field="area_id" label="Area" lookup="area" />
        <F.Ref field="program_id" label="Program" lookup="program" />
        <F.Ref field="condition_id" label="Condition" lookup="condition" intent="reference" />
        <F.Text field="data_source" label="Data source" />
        <F.Textarea field="notes" label="Notes" />
      </RecordSection>
    </Record>
  )
}
