import { CheckCircle2 } from "lucide-react"
import { Record, RecordSection } from "@/components/record/Record"
import { useField, useFields } from "@/components/record/context"
import { recordFields } from "@/components/record/typed"
import { AgeTile, DeltaTile, Segmented } from "@/components/detail/kit"
import { Button } from "@/components/ui/primitives"
import { REGISTRY } from "@/services/api/registry"
import type { Commitment, Entity } from "@/services/api/types"

const F = recordFields<Commitment>()

const STATUS: { value: string; label: string }[] = [
  { value: "open", label: "Open" },
  { value: "in_progress", label: "Active" },
  { value: "waiting", label: "Waiting" },
  { value: "fulfilled", label: "Fulfilled" },
  { value: "broken", label: "Broken" },
  { value: "cancelled", label: "Cancelled" },
]

function StatusField() {
  const { value, save } = useField("status")
  return (
    <div className="space-y-2">
      <div className="text-[11px] font-semibold uppercase tracking-wide text-slate-400">Status</div>
      <Segmented options={STATUS} value={value as string} onChange={(v) => save(v)} />
      {value !== "fulfilled" && (
        <Button size="sm" onClick={() => save("fulfilled")}>
          <CheckCircle2 size={14} /> Mark fulfilled
        </Button>
      )}
    </div>
  )
}

/** Read-only tiles derived from dates the fields below own. */
function Tiles() {
  const { row } = useFields([])
  return (
    <div className="grid grid-cols-2 gap-2">
      <AgeTile date={row.date_made as never} label="days ago made" />
      <DeltaTile
        date={row.due_date as never}
        futureLabel="days to due"
        pastLabel="days overdue"
      />
    </div>
  )
}

export function CommitmentDetail({
  entity,
  onClose,
}: {
  entity: Entity
  onClose: () => void
}) {
  return (
    <Record def={REGISTRY.commitment} entity={entity} onClose={onClose}>
      <RecordSection>
        <F.Title field="description" placeholder="What was promised?" />
      </RecordSection>

      <Tiles />
      <StatusField />

      <RecordSection title="Dates">
        <F.Date field="date_made" label="Made on" />
        <F.Date field="due_date" label="Due" />
      </RecordSection>

      <RecordSection title="Parties">
        <F.Ref field="owner_id" label="Owner" lookup="people" />
        <F.Ref field="responsible_id" label="Responsible" lookup="people" />
        <F.Ref field="beneficiary_id" label="Beneficiary" lookup="people" />
        <F.Text field="acceptance_status" label="Acceptance" />
      </RecordSection>

      <RecordSection title="Evidence">
        <F.Textarea field="evidence" label="Evidence" minRows={2} />
        <F.Root />
      </RecordSection>
    </Record>
  )
}
