import { Record, RecordSection } from "@/components/record/Record"
import { recordFields } from "@/components/record/typed"
import { AREA_STATUS } from "@/services/api/enums"
import { REGISTRY } from "@/services/api/registry"
import type { Area, Entity } from "@/services/api/types"

const F = recordFields<Area>()


export function AreaDetail({ entity, onClose }: { entity: Entity; onClose: () => void }) {
  return (
    <Record def={REGISTRY.area} entity={entity} onClose={onClose}>
      <RecordSection>
        <F.Title field="name" placeholder="Area name" />
        <F.Select field="status" label="Status" options={AREA_STATUS} />
        <F.Text field="review_frequency" label="Review frequency" placeholder="weekly" />
      </RecordSection>

      <RecordSection title="Purpose">
        {/* What this area is *and* what it is for — one statement, because for a
            sphere you steward those are the same sentence. What must be *true*
            is the Outcomes panel below. */}
        <F.Textarea
          field="purpose"
          label="Purpose"
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
