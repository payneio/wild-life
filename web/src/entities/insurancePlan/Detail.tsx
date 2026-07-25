import { Phone } from "lucide-react"
import { Record, RecordSection } from "@/components/record/Record"
import { useFields } from "@/components/record/context"
import { recordFields } from "@/components/record/typed"
import { REGISTRY } from "@/services/api/registry"
import type { Entity, InsurancePlan } from "@/services/api/types"

const F = recordFields<InsurancePlan>()

const TYPES = ["medical", "dental", "vision", "pharmacy"] as const
const STATUS = ["active", "inactive"] as const

/** Tap-to-call, derived from the phone field the layout owns below. */
function CallLink() {
  const { row } = useFields([])
  const phone = row.phone as string | null
  if (!phone) return null
  return (
    <a
      href={`tel:${phone}`}
      className="inline-flex items-center gap-1.5 text-sm font-medium text-indigo-600 hover:underline sm:col-span-2"
    >
      <Phone size={14} /> Call {phone}
    </a>
  )
}

/**
 * The card the old `extra` drew was read-only, so the member and RX numbers were
 * shown twice — once as a card, once as inputs. Here the card *is* the editor.
 */
export function InsurancePlanDetail({
  entity,
  onClose,
}: {
  entity: Entity
  onClose: () => void
}) {
  return (
    <Record def={REGISTRY.insurancePlan} entity={entity} onClose={onClose}>
      <RecordSection>
        <F.Title field="name" placeholder="Plan name" />
        <F.Select field="plan_type" label="Type" options={TYPES} />
        <F.Select field="status" label="Status" options={STATUS} />
        <F.Ref field="organization_id" label="Carrier" lookup="organization" />
        <F.Text field="network" label="Network" />
      </RecordSection>

      <div className="rounded-2xl border border-slate-200 bg-surface-2 p-4">
        <RecordSection title="Card">
          <F.Text field="member_id" label="Member ID" />
          <F.Text field="group_number" label="Group" />
          <F.Text field="rx_bin" label="RX BIN" />
          <F.Text field="rx_pcn" label="RX PCN" />
          <F.Text field="rx_group" label="RX Group" />
          <F.Text field="phone" label="Phone" />
          <CallLink />
        </RecordSection>
      </div>

      <RecordSection>
        <F.Textarea field="notes" label="Notes" />
      </RecordSection>
    </Record>
  )
}
