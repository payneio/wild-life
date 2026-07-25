import { Record, RecordSection } from "@/components/record/Record"
import { ConditionDetail as ConditionTimeline } from "@/components/detail/health"
import { recordFields } from "@/components/record/typed"
import { REGISTRY } from "@/services/api/registry"
import type { Condition, Entity } from "@/services/api/types"

const F = recordFields<Condition>()

const CATEGORY = [
  "gastrointestinal",
  "cardiovascular",
  "dermatologic",
  "musculoskeletal",
  "urologic",
  "auditory",
  "mental_health",
  "other",
] as const
const STATUS = ["active", "monitoring", "chronic", "resolved", "ruled_out"] as const

export function ConditionDetail({ entity, onClose }: { entity: Entity; onClose: () => void }) {
  return (
    <Record def={REGISTRY.condition} entity={entity} onClose={onClose}>
      <RecordSection>
        <F.Title field="name" placeholder="Condition" />
        <F.Select field="status" label="Status" options={STATUS} />
        <F.Select field="category" label="Category" options={CATEGORY} />
        <F.Text field="severity" label="Severity" />
        <F.Textarea field="description" label="Description" minRows={2} />
      </RecordSection>

      <RecordSection title="Course">
        <F.Date field="onset_date" label="Onset" />
        <F.Date field="resolved_date" label="Resolved" />
        <F.Ref field="diagnosed_by_id" label="Diagnosed by" lookup="people" />
      </RecordSection>

      {/* The event timeline is an earned view — it reads the calendar, not fields. */}
      <ConditionTimeline entity={entity} />

      <RecordSection title="Context">
        <F.Ref field="area_id" label="Area" lookup="area" />
        <F.Ref field="program_id" label="Program" lookup="program" />
        <F.Textarea field="notes" label="Notes" />
      </RecordSection>
    </Record>
  )
}
