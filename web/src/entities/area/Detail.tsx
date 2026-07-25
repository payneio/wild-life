import { Record, RecordSection } from "@/components/record/Record"
import { recordFields } from "@/components/record/typed"
import { REGISTRY } from "@/services/api/registry"
import type { Area, Entity } from "@/services/api/types"

const F = recordFields<Area>()

const STATUS = ["active", "inactive", "archived"] as const

export function AreaDetail({ entity, onClose }: { entity: Entity; onClose: () => void }) {
  return (
    <Record def={REGISTRY.area} entity={entity} onClose={onClose}>
      <RecordSection>
        <F.Title field="name" placeholder="Area name" />
        <F.Select field="status" label="Status" options={STATUS} />
        <F.Text field="review_frequency" label="Review frequency" placeholder="weekly" />
        <F.Textarea field="description" label="Description" minRows={2} />
      </RecordSection>

      <RecordSection title="Standard">
        <F.Textarea
          field="desired_standard"
          label="Desired standard"
          placeholder="What does good look like here?"
          minRows={2}
        />
      </RecordSection>

      <RecordSection title="Ownership">
        <F.Ref field="accountable_owner_id" label="Accountable" lookup="people" />
        <F.Ref field="responsible_lead_id" label="Responsible lead" lookup="people" />
        {/* Set when the area is archived; shown so an archived area explains itself. */}
        <F.DateTime field="archived_at" label="Archived at" />
      </RecordSection>
    </Record>
  )
}
