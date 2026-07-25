import { Record, RecordSection } from "@/components/record/Record"
import { OrganizationExtra } from "@/components/detailExtras"
import { recordFields } from "@/components/record/typed"
import { REGISTRY } from "@/services/api/registry"
import type { Entity, Organization } from "@/services/api/types"

const F = recordFields<Organization>()

const TYPES = [
  "employer",
  "client",
  "vendor",
  "partner",
  "nonprofit",
  "school",
  "government",
  "community",
  "other",
] as const
const STATUS = ["active", "inactive", "archived"] as const

export function OrganizationDetail({
  entity,
  onClose,
}: {
  entity: Entity
  onClose: () => void
}) {
  return (
    <Record def={REGISTRY.organization} entity={entity} onClose={onClose}>
      <RecordSection>
        <F.Title field="name" placeholder="Organization name" />
        <F.Select field="org_type" label="Type" options={TYPES} />
        <F.Select field="status" label="Status" options={STATUS} />
        <F.Text field="industry" label="Industry" />
        <F.Textarea field="description" label="Description" minRows={2} />
      </RecordSection>

      <RecordSection title="Contact">
        <F.Text field="website" label="Website" placeholder="https://…" />
        <F.Text field="email" label="Email" />
        <F.Text field="phone" label="Phone" />
        <F.Text field="address" label="Address" full />
      </RecordSection>

      {/* The people-affiliation graph is an earned relationship view. */}
      <OrganizationExtra entity={entity} />

      <RecordSection>
        <F.Textarea field="notes" label="Notes" />
      </RecordSection>
    </Record>
  )
}
