import { Record, RecordSection } from "@/components/record/Record"
import { GoalDetail as GoalProgress } from "@/components/detail/planning"
import { recordFields } from "@/components/record/typed"
import { GOAL_STATUS } from "@/services/api/enums"
import { REGISTRY } from "@/services/api/registry"
import type { Entity, Goal } from "@/services/api/types"

const F = recordFields<Goal>()


export function GoalDetail({ entity, onClose }: { entity: Entity; onClose: () => void }) {
  return (
    <Record def={REGISTRY.goal} entity={entity} onClose={onClose}>
      <RecordSection>
        <F.Title field="name" placeholder="Goal" />
      </RecordSection>

      {/* Ring, metric trend and linked projects. */}
      <GoalProgress entity={entity} />

      <RecordSection>
        <F.Select field="status" label="Status" options={GOAL_STATUS} />
        <F.Date field="target_date" label="Target date" />
        {/* Manual override; the ring prefers the computed value when there is
            one, so this stays editable but is not the whole story. */}
        <F.Number field="progress" label="Manual progress (%)" />
        <F.Textarea field="description" label="Description" minRows={2} />
      </RecordSection>

      <RecordSection title="Measurement">
        <F.Ref field="metric_id" label="Metric" lookup="metric" />
        <F.Number field="baseline" label="Baseline" />
        <F.Number field="target_value" label="Target value" />
        <F.Text field="target_state" label="Target state" />
        <F.Textarea field="measurement_method" label="Method" minRows={2} />
      </RecordSection>

      <RecordSection title="Context">
        <F.Ref field="area_id" label="Area" lookup="area" />
        <F.Ref field="program_id" label="Program" lookup="program" />
        <F.Ref field="condition_id" label="Condition" lookup="condition" />
      </RecordSection>
    </Record>
  )
}
