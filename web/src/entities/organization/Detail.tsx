import { AddressFields } from "@/components/record/AddressFields"
import { Record, RecordSection } from "@/components/record/Record"
import { OrganizationExtra } from "@/components/detailExtras"
import { recordFields } from "@/components/record/typed"
import { ORG_STATUS, ORG_TYPE } from "@/services/api/enums"
import { REGISTRY } from "@/services/api/registry"
import type { Entity, Organization } from "@/services/api/types"

const F = recordFields<Organization>()


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
        <F.Select field="org_type" label="Type" options={ORG_TYPE} />
        <F.Select field="status" label="Status" options={ORG_STATUS} />
        <F.Text field="industry" label="Industry" />
        <F.Textarea field="description" label="Description" minRows={2} />
      </RecordSection>

      <RecordSection title="Contact">
        <F.Text field="website" label="Website" placeholder="https://…" />
        <F.Text field="email" label="Email" />
        <F.Phone field="phone" label="Phone" />
        <AddressFields />
      </RecordSection>

      {/* The people-affiliation graph is an earned relationship view. */}
      <OrganizationExtra entity={entity} />

    </Record>
  )
}
