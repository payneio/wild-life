import { Record, RecordSection } from "@/components/record/Record"
import { MedicationDetail as MedicationRegimen } from "@/components/detail/health"
import { recordFields } from "@/components/record/typed"
import { MED_TYPE } from "@/services/api/enums"
import { REGISTRY } from "@/services/api/registry"
import type { Entity, Medication } from "@/services/api/types"

const F = recordFields<Medication>()


/**
 * Medication is identity; the protocols schedule it. The regimen block — dose
 * routines, adherence, intake logging — is the earned §5 view and stays intact;
 * only the identity fields around it are composed.
 */
export function MedicationDetail({ entity, onClose }: { entity: Entity; onClose: () => void }) {
  return (
    <Record def={REGISTRY.medication} entity={entity} onClose={onClose}>
      <RecordSection>
        <F.Title field="name" placeholder="Medication" />
        <F.Select field="med_type" label="Type" options={MED_TYPE} />
        <F.Text field="brand" label="Brand" />
        <F.Text field="reason" label="Reason" full />
      </RecordSection>

      <MedicationRegimen entity={entity} />

      <RecordSection title="Care team">
        <F.Ref field="condition_id" label="Condition" lookup="condition" />
        <F.Ref field="prescriber_id" label="Prescriber" lookup="people" />
        <F.Ref field="pharmacy_id" label="Pharmacy" lookup="organization" />
      </RecordSection>

      <RecordSection>
        <F.Textarea field="instructions" label="Instructions" minRows={2} />
        <F.Textarea field="notes" label="Notes" minRows={2} />
      </RecordSection>
    </Record>
  )
}
