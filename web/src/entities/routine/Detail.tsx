import { Record, RecordSection } from "@/components/record/Record"
import { RoutineDetail as RoutineConsistency } from "@/components/detail/planning"
import { recordFields } from "@/components/record/typed"
import { SLOTS, WEEKDAYS } from "@/lib/slots"
import { REGISTRY } from "@/services/api/registry"
import type { Entity, Routine } from "@/services/api/types"

const F = recordFields<Routine>()

const STATUS = ["active", "paused", "archived"] as const

/**
 * Every routine is a protocol step. `timing` and `days_of_week` are the first
 * multi-selects to render as real controls in the detail editor — the generic
 * one had no case for them, so they arrived as a text box and saved a
 * comma-joined string back into an array column.
 */
export function RoutineDetail({ entity, onClose }: { entity: Entity; onClose: () => void }) {
  return (
    <Record
      def={REGISTRY.routine}
      entity={entity}
      onClose={onClose}
      omit={[
        // Ordering within a protocol, set by drag in the protocol's step list.
        "sort_order",
      ]}
    >
      <RecordSection>
        <F.Title field="activity" placeholder="What's the routine?" />
        <F.Text field="name" label="Name" />
        <F.Select field="status" label="Status" options={STATUS} />
      </RecordSection>

      <RoutineConsistency entity={entity} />

      <RecordSection title="Schedule">
        <F.MultiSelect field="timing" label="Times of day" options={SLOTS} />
        <F.MultiSelect field="days_of_week" label="Days (blank = every day)" options={WEEKDAYS} />
        <F.MultiSelect field="preferred_days" label="Preferred days" options={WEEKDAYS} />
        <F.Text field="frequency" label="Frequency" placeholder="daily" />
        <F.Number field="interval_days" label="Every N days" />
        <F.Text field="preferred_time" label="Preferred time" />
        <F.Date field="start_date" label="Start" />
        <F.Date field="end_date" label="End" />
      </RecordSection>

      <RecordSection title="Dose">
        <F.Number field="amount" label="Amount" />
        <F.Text field="unit" label="Unit" placeholder="mg, ml, reps" />
        <F.Ref field="medication_id" label="Medication" lookup="medication" />
      </RecordSection>

      <RecordSection title="Context">
        <F.Ref field="protocol_id" label="Protocol" lookup="protocol" required />
        <F.Ref field="area_id" label="Area" lookup="area" />
        <F.Ref field="program_id" label="Program" lookup="program" />
        <F.Ref field="responsible_id" label="Responsible" lookup="people" />
        <F.Text field="tracking_method" label="Tracking method" />
        <F.Textarea field="notes" label="Notes" />
      </RecordSection>
    </Record>
  )
}
