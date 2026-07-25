import { Record, RecordSection } from "@/components/record/Record"
import { ProgramDetail as ProgramStats } from "@/components/detail/planning"
import { recordFields } from "@/components/record/typed"
import { REGISTRY } from "@/services/api/registry"
import type { Entity, Program } from "@/services/api/types"

const F = recordFields<Program>()

const STATUS = ["proposed", "active", "paused", "completed", "cancelled"] as const

/**
 * A container: the portfolio stats it earns as a §5 view stay, they just sit
 * inside the layout rather than being appended below a generic field grid.
 */
export function ProgramDetail({ entity, onClose }: { entity: Entity; onClose: () => void }) {
  return (
    <Record def={REGISTRY.program} entity={entity} onClose={onClose}>
      <RecordSection>
        <F.Title field="name" placeholder="Program name" />
      </RecordSection>

      <ProgramStats entity={entity} />

      <RecordSection>
        <F.Select field="status" label="Status" options={STATUS} />
        <F.Ref field="area_id" label="Area" lookup="area" />
        <F.Date field="start_date" label="Start" />
        <F.Date field="target_date" label="Target" />
        <F.Textarea field="description" label="Description" minRows={2} />
      </RecordSection>

      <RecordSection title="Intent">
        <F.Textarea field="intended_outcome" label="Intended outcome" minRows={2} />
        <F.Textarea field="success_criteria" label="Success criteria" minRows={2} />
      </RecordSection>

      <RecordSection title="Ownership & cadence">
        <F.Ref field="accountable_owner_id" label="Accountable" lookup="people" />
        <F.Ref field="responsible_lead_id" label="Responsible lead" lookup="people" />
        <F.Text field="review_frequency" label="Review frequency" placeholder="monthly" />
        <F.Text field="reporting_cadence" label="Reporting cadence" placeholder="quarterly" />
      </RecordSection>
    </Record>
  )
}
