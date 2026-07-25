import { Clock } from "lucide-react"
import { Record, RecordSection } from "@/components/record/Record"
import { useField, useFields } from "@/components/record/context"
import { recordFields } from "@/components/record/typed"
import { AgeTile, DeltaTile, Segmented, StatTile } from "@/components/detail/kit"
import { shiftDays } from "@/components/detail/dates"
import { Button } from "@/components/ui/primitives"
import { REGISTRY } from "@/services/api/registry"
import type { Delegation, Entity, Priority } from "@/services/api/types"

const F = recordFields<Delegation>()

const STATUS = [
  "draft",
  "requested",
  "accepted",
  "in_progress",
  "waiting_for_update",
  "blocked",
  "delivered",
  "revision_requested",
  "accepted_as_complete",
  "declined",
  "reassigned",
  "cancelled",
] as const

const PRIORITY: { value: Priority; label: string }[] = [
  { value: "low", label: "Low" },
  { value: "medium", label: "Med" },
  { value: "high", label: "High" },
  { value: "urgent", label: "Urgent" },
]

function Tiles() {
  const { row } = useFields([])
  return (
    <div className="grid grid-cols-3 gap-2">
      <AgeTile date={row.date_delegated as never} label="days out" />
      <DeltaTile
        date={row.expected_completion_date as never}
        futureLabel="days to due"
        pastLabel="days overdue"
      />
      <StatTile
        value={(row.escalation_level as number) ?? 0}
        label="escalation"
        tone={(row.escalation_level as number) > 0 ? "danger" : "muted"}
      />
    </div>
  )
}

function PriorityField() {
  const { value, save } = useField("priority")
  return (
    <div className="space-y-2">
      <div className="text-[11px] font-semibold uppercase tracking-wide text-slate-400">
        Priority
      </div>
      <Segmented options={PRIORITY} value={value as Priority} onChange={(v) => save(v)} />
    </div>
  )
}

/** Log contact / snooze — the two moves that keep a delegation alive. */
function FollowUp() {
  const { save } = useFields(["last_contact_date", "follow_up_date"])
  return (
    <div className="flex flex-wrap items-center gap-2">
      <Button
        variant="secondary"
        size="sm"
        onClick={() => save({ last_contact_date: shiftDays(0) })}
      >
        <Clock size={14} /> Logged contact today
      </Button>
      {([["+3 days", 3], ["+1 week", 7], ["+2 weeks", 14]] as [string, number][]).map(
        ([label, n]) => (
          <button
            key={label}
            onClick={() => save({ follow_up_date: shiftDays(n) })}
            className="rounded-full bg-slate-100 px-2.5 py-1 text-xs font-medium text-slate-600 transition hover:bg-slate-200"
          >
            {label}
          </button>
        ),
      )}
    </div>
  )
}

export function DelegationDetail({ entity, onClose }: { entity: Entity; onClose: () => void }) {
  return (
    <Record def={REGISTRY.delegation} entity={entity} onClose={onClose}>
      <RecordSection>
        <F.Title field="requested_outcome" placeholder="What outcome is delegated?" />
      </RecordSection>

      <Tiles />

      <RecordSection>
        <F.Select field="status" label="Status" options={STATUS} />
        <F.Number field="escalation_level" label="Escalation" />
      </RecordSection>

      <PriorityField />
      <FollowUp />

      <RecordSection title="Dates">
        <F.Date field="date_delegated" label="Delegated on" />
        <F.Date field="accepted_date" label="Accepted" />
        <F.Date field="expected_completion_date" label="Expected" />
        <F.Date field="delivered_date" label="Delivered" />
        <F.Date field="follow_up_date" label="Follow up" />
        <F.Date field="last_contact_date" label="Last contact" />
      </RecordSection>

      <RecordSection title="Parties">
        <F.Ref field="delegator_id" label="Delegator" lookup="people" />
        <F.Ref field="responsible_id" label="Responsible" lookup="people" />
        <F.Ref field="accountable_owner_id" label="Accountable" lookup="people" />
        <F.Checkbox field="acceptance_required" label="Requires acceptance" />
      </RecordSection>

      <RecordSection title="Progress">
        <F.Textarea field="instructions" label="Instructions" minRows={2} />
        <F.Textarea field="latest_update" label="Latest update" minRows={2} />
        <F.Textarea field="completion_evidence" label="Completion evidence" minRows={2} />
        <F.Root />
      </RecordSection>
    </Record>
  )
}
