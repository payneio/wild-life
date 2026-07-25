import { Record, RecordSection } from "@/components/record/Record"
import { recordFields } from "@/components/record/typed"
import { REGISTRY } from "@/services/api/registry"
import type { Decision, Entity } from "@/services/api/types"

const F = recordFields<Decision>()

/**
 * A decision reads as a narrative — question, what was weighed, what was chosen,
 * why — so the layout follows that order rather than the alphabetical grid the
 * generic renderer produced. The old surface additionally showed the decision
 * twice: once as a textarea in the grid, once as a read-only callout below.
 */
export function DecisionDetail({
  entity,
  onClose,
}: {
  entity: Entity
  onClose: () => void
}) {
  return (
    <Record def={REGISTRY.decision} entity={entity} onClose={onClose}>
      <RecordSection>
        <F.Title field="question" placeholder="What has to be decided?" />
      </RecordSection>

      <RecordSection title="The call">
        <F.Textarea field="decision" label="Decision" minRows={2} />
        <F.Textarea field="rationale" label="Rationale" minRows={2} />
      </RecordSection>

      <RecordSection title="Working">
        <F.Textarea field="options_considered" label="Options considered" minRows={2} />
        <F.Textarea field="assumptions" label="Assumptions" minRows={2} />
      </RecordSection>

      <RecordSection title="Ownership">
        <F.Ref field="owner_id" label="Owner" lookup="people" />
        <F.Date field="decided_on" label="Decided on" />
        <F.Date field="review_date" label="Revisit on" />
        <F.Root />
      </RecordSection>
    </Record>
  )
}
