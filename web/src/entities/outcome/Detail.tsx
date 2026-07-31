import { Record, RecordSection } from "@/components/record/Record"
import { OutcomeDetail as OutcomeVerdict } from "@/components/detail/planning"
import { recordFields } from "@/components/record/typed"
import { OUTCOME_KIND, OUTCOME_STATUS } from "@/services/api/enums"
import { REGISTRY } from "@/services/api/registry"
import type { Entity, Outcome } from "@/services/api/types"

const F = recordFields<Outcome>()

export function OutcomeRecord({
  entity,
  onClose,
}: {
  entity: Entity
  onClose: () => void
}) {
  const outcome = entity as Outcome
  return (
    <Record def={REGISTRY.outcome} entity={entity} onClose={onClose}>
      <RecordSection>
        {/* The statement *is* the name. "Triglycerides under 100 mg/dL" was
            previously typed once here and again into `target_state`. */}
        <F.Title field="statement" placeholder="What must be true" />
      </RecordSection>

      <OutcomeVerdict entity={entity} />

      <RecordSection>
        <F.Select field="kind" label="Kind" options={OUTCOME_KIND} />
        <F.Select field="status" label="Status" options={OUTCOME_STATUS} />
        <F.Textarea field="description" label="Description" minRows={2} />
      </RecordSection>

      {/* Each kind asks for exactly its own fields — a standard has no deadline
          to miss, so only a target is asked for a baseline and a date. */}
      <RecordSection title="Measurement">
        <F.Ref field="metric_id" label="Metric" lookup="metric" />
        <F.Number field="target_min" label="At least" />
        <F.Number field="target_max" label="At most" />
        {outcome.kind === "target" && <F.Number field="baseline" label="Baseline" />}
        {outcome.kind === "target" && <F.Date field="by_when" label="By when" />}
        {/* When the claim became true. No longer gated by kind: an outcome being
            satisfied is a resolution worth dating whichever kind it is. */}
        <F.DateTime field="satisfied_at" label="Satisfied at" />
      </RecordSection>

      <RecordSection title="Belongs to">
        <F.Root label="Belongs to" />
      </RecordSection>
    
      {/* A target is discharged once; a standard cannot be, and accumulates
          evaluations instead. This says why a claim stopped being live. */}
      <RecordSection title="Ending">
        <F.Text field="ending_cause" label="Cause" placeholder="open" />
        <F.Textarea field="ending_note" label="Why" />
      </RecordSection>

    </Record>
  )
}
