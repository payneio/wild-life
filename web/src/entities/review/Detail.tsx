import { CheckCircle2 } from "lucide-react"
import { Record, RecordSection } from "@/components/record/Record"
import { useFields } from "@/components/record/context"
import { recordFields } from "@/components/record/typed"
import { Button } from "@/components/ui/primitives"
import { formatDate } from "@/lib/utils"
import { REVIEW_TYPE } from "@/services/api/enums"
import { REGISTRY } from "@/services/api/registry"
import type { Entity, Review } from "@/services/api/types"

const F = recordFields<Review>()


/** Completion is a single act, so it gets a button rather than a datetime input. */
function Completion() {
  const { row, save } = useFields(["completed_at"])
  const completed = row.completed_at as string | null
  return (
    <div className="flex flex-wrap items-center gap-2">
      {completed ? (
        <>
          <span className="inline-flex items-center gap-1 rounded-full bg-emerald-100 px-2.5 py-1 text-xs font-medium text-emerald-700">
            <CheckCircle2 size={12} /> Completed {formatDate(completed as never)}
          </span>
          <button
            onClick={() => save({ completed_at: null })}
            className="text-xs text-slate-400 transition hover:text-slate-700"
          >
            reopen
          </button>
        </>
      ) : (
        <Button size="sm" onClick={() => save({ completed_at: new Date().toISOString() })}>
          <CheckCircle2 size={14} /> Mark complete
        </Button>
      )}
    </div>
  )
}

/** The entity list is written by the review generator, not edited by hand. */
function EntitiesReviewed() {
  const { row } = useFields(["entities_reviewed"])
  const items = (row.entities_reviewed as unknown[]) ?? []
  if (items.length === 0) return null
  return (
    <div className="text-xs text-slate-400">{items.length} entities covered</div>
  )
}

export function ReviewDetail({ entity, onClose }: { entity: Entity; onClose: () => void }) {
  return (
    <Record def={REGISTRY.review} entity={entity} onClose={onClose}>
      <RecordSection>
        <F.Select field="review_type" label="Type" options={REVIEW_TYPE} />
        <F.Date field="period_start" label="Period start" />
        <F.Date field="period_end" label="Period end" />
      </RecordSection>

      <Completion />
      <EntitiesReviewed />

      <RecordSection title="Findings">
        <F.Textarea field="observations" label="Observations" minRows={3} />
        <F.Textarea field="decisions" label="Decisions" minRows={2} />
        <F.Textarea field="risks" label="Risks" minRows={2} />
        <F.Textarea field="follow_up_actions" label="Follow-up actions" minRows={2} />
      </RecordSection>
    </Record>
  )
}
