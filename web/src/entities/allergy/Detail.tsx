import { Record, RecordSection } from "@/components/record/Record"
import { useFields } from "@/components/record/context"
import { recordFields } from "@/components/record/typed"
import { cn } from "@/lib/utils"
import { REGISTRY } from "@/services/api/registry"
import type { Allergy, Entity } from "@/services/api/types"

const F = recordFields<Allergy>()

const TYPES = ["medication", "food", "environmental", "other"] as const
const SEVERITY = ["mild", "moderate", "severe", "unknown"] as const
const STATUS = ["active", "suspected", "resolved"] as const

const SEVERITY_TONE: Record<string, string> = {
  mild: "border-amber-300 bg-amber-50",
  moderate: "border-orange-400 bg-orange-50",
  severe: "border-red-500 bg-red-50",
  unknown: "border-slate-300 bg-slate-50",
}

/** Severity banding, derived from the field the select below owns. */
function SeverityBanner() {
  const { row } = useFields([])
  const severity = (row.severity as string | null) ?? ""
  const reaction = row.reaction as string | null
  if (!severity && !reaction) return null
  return (
    <div
      className={cn("rounded-xl border-l-4 px-4 py-3", SEVERITY_TONE[severity] ?? SEVERITY_TONE.unknown)}
    >
      {severity && <div className="text-sm font-semibold capitalize">{severity} reaction</div>}
      {reaction && <p className="mt-0.5 text-sm text-slate-700">{reaction}</p>}
    </div>
  )
}

export function AllergyDetail({ entity, onClose }: { entity: Entity; onClose: () => void }) {
  return (
    <Record def={REGISTRY.allergy} entity={entity} onClose={onClose}>
      <RecordSection>
        <F.Title field="substance" placeholder="Substance" />
      </RecordSection>

      <SeverityBanner />

      <RecordSection>
        <F.Select field="severity" label="Severity" options={SEVERITY} />
        <F.Select field="status" label="Status" options={STATUS} />
        <F.Select field="allergy_type" label="Type" options={TYPES} />
        <F.Date field="noted_on" label="Noted on" />
        <F.Textarea field="reaction" label="Reaction" minRows={2} />
        <F.Textarea field="notes" label="Notes" minRows={2} />
      </RecordSection>
    </Record>
  )
}
