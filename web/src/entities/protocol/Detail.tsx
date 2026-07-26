import { Record, RecordSection } from "@/components/record/Record"
import { ProtocolExtra } from "@/components/detailExtras"
import { recordFields } from "@/components/record/typed"
import { REGISTRY } from "@/services/api/registry"
import type { Entity, Protocol } from "@/services/api/types"

const F = recordFields<Protocol>()

/**
 * Protocols own all scheduling, so the step list is the substance here and the
 * fields are its frame. Lifecycle is derived from the window — `paused` is the
 * one stored bit, which is why it's a checkbox rather than a status select.
 */
export function ProtocolDetail({ entity, onClose }: { entity: Entity; onClose: () => void }) {
  return (
    <Record def={REGISTRY.protocol} entity={entity} onClose={onClose}>
      <RecordSection>
        <F.Title field="name" placeholder="Protocol name" />
        <F.Text field="category" label="Category" />
        <F.Checkbox field="paused" label="Paused" />
        <F.Textarea field="intended_outcome" label="Intended outcome" minRows={2} />
      </RecordSection>

      <RecordSection title="Window">
        <F.Date field="start_date" label="Start" />
        <F.Date field="end_date" label="End" />
        <F.Text field="duration" label="Duration" placeholder="6 weeks" />
      </RecordSection>

      {/* The step list — what this protocol actually schedules. */}
      <ProtocolExtra entity={entity} />

      <RecordSection title="Context">
        <F.Ref field="condition_id" label="Condition" lookup="condition" intent="reference" />
        <F.Ref field="provider_id" label="Provider" lookup="people" />
        <F.Ref field="area_id" label="Area" lookup="area" />
        <F.Ref field="program_id" label="Program" lookup="program" />
        <F.Textarea field="notes" label="Notes" />
      </RecordSection>
    </Record>
  )
}
