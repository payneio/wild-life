import { Record, RecordSection } from "@/components/record/Record"
import { recordFields } from "@/components/record/typed"
import { GroupCapture, GroupMembers, GroupReadings } from "@/entities/metricGroup/Extras"
import { REGISTRY } from "@/services/api/registry"
import type { Entity, MetricGroup } from "@/services/api/types"

const F = recordFields<MetricGroup>()

/**
 * A set of numbers read together — a lipid panel, a cuff reading, a monthly look
 * at every balance.
 *
 * The order of the page is the order of the work: record what you just measured,
 * read the history, and only then adjust what the group contains. Membership is
 * the thing you touch least.
 */
export function MetricGroupDetail({
  entity,
  onClose,
}: {
  entity: Entity
  onClose: () => void
}) {
  const group = entity as MetricGroup
  return (
    <Record def={REGISTRY.metricGroup} entity={entity} onClose={onClose}>
      <RecordSection>
        <F.Title field="name" placeholder="Group name" />
        <F.Root label="Measures" />
        <F.Textarea field="description" label="Description" />
      </RecordSection>

      {/* One act, one moment — not one trip per number. */}
      <GroupCapture group={group} />
      <GroupReadings group={group} />
      <GroupMembers group={group} />
    </Record>
  )
}
