import { CheckCircle2 } from "lucide-react"
import { Record, RecordSection } from "@/components/record/Record"
import { useFields } from "@/components/record/context"
import { recordFields } from "@/components/record/typed"
import { AgeTile, DeltaTile, Segmented } from "@/components/detail/kit"
import { shiftDays } from "@/components/detail/dates"
import { Button } from "@/components/ui/primitives"
import { REQUEST_KIND } from "@/services/api/enums"
import { REGISTRY } from "@/services/api/registry"
import type { Entity, Request } from "@/services/api/types"

const F = recordFields<Request>()

const STATUS: { value: string; label: string }[] = [
  { value: "open", label: "Open" },
  { value: "resolved", label: "Resolved" },
  { value: "cancelled", label: "Cancelled" },
]

/** Status plus the two things you actually do with an open request. */
function Cockpit() {
  const { row, save } = useFields(["status", "resolved_at", "follow_up_date"])
  const status = row.status as string
  return (
    <div className="space-y-2">
      <div className="text-[11px] font-semibold uppercase tracking-wide text-slate-400">Status</div>
      <Segmented options={STATUS} value={status} onChange={(v) => save({ status: v })} />
      <div className="flex flex-wrap items-center gap-2">
        {status !== "resolved" && (
          <Button
            size="sm"
            onClick={() => save({ status: "resolved", resolved_at: new Date().toISOString() })}
          >
            <CheckCircle2 size={14} /> Mark resolved
          </Button>
        )}
        <span className="text-xs text-slate-400">Snooze:</span>
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
    </div>
  )
}

function Tiles() {
  const { row } = useFields([])
  return (
    <div className="grid grid-cols-3 gap-2">
      <AgeTile date={row.created_at as never} label="days open" />
      <DeltaTile
        date={row.needed_by as never}
        futureLabel="days to needed"
        pastLabel="days overdue"
      />
      <DeltaTile
        date={row.follow_up_date as never}
        futureLabel="to follow-up"
        pastLabel="follow-up due"
      />
    </div>
  )
}

export function RequestDetail({ entity, onClose }: { entity: Entity; onClose: () => void }) {
  return (
    <Record def={REGISTRY.request} entity={entity} onClose={onClose}>
      <RecordSection>
        <F.Title field="subject" placeholder="What's being asked?" />
      </RecordSection>

      <Tiles />
      <Cockpit />

      <RecordSection>
        <F.Select field="kind" label="Kind" options={REQUEST_KIND} />
        <F.Date field="needed_by" label="Needed by" />
        <F.Date field="follow_up_date" label="Follow up" />
        <F.DateTime field="resolved_at" label="Resolved at" />
        <F.Textarea field="body" label="Body" minRows={3} />
      </RecordSection>

      <RecordSection title="Parties">
        <F.Ref field="requester_id" label="Requester" lookup="people" />
        <F.Ref field="addressee_id" label="Addressee" lookup="people" />
        <F.Text field="external_label" label="External party" />
      </RecordSection>

      <RecordSection title="Progress">
        <F.Text field="next_action" label="Next action" full />
        <F.Textarea field="last_communication" label="Last communication" minRows={2} />
        <F.Textarea field="resolution" label="Resolution" minRows={2} />
        <F.Root />
      </RecordSection>
    </Record>
  )
}
