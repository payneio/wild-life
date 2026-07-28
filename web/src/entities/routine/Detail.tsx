import { Record, RecordSection } from "@/components/record/Record"
import { RoutineDetail as RoutineConsistency } from "@/components/detail/planning"
import { recordFields } from "@/components/record/typed"
import { SLOTS, WEEKDAYS } from "@/lib/slots"
import { ROUTINE_STATUS } from "@/services/api/enums"
import { REGISTRY } from "@/services/api/registry"
import type { Entity, Routine } from "@/services/api/types"

const F = recordFields<Routine>()


/**
 * A routine is **the rule**: one cadence expression for anything that recurs.
 *
 * It is no longer required to be a protocol step — a weekly habit had to pose as
 * a clinical one, and its liveness could only ever be the protocol's. A protocol
 * is now a container that *narrows* a rule, which is why `protocol_id` stopped
 * being `required` here: the generated type went nullable and the compiler said
 * so, rather than a convention having to be remembered.
 *
 * `timing` and `days_of_week` are the first multi-selects to render as real
 * controls in the detail editor — the generic one had no case for them, so they
 * arrived as a text box and saved a comma-joined string back into an array column.
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
        // What act this rule generates. Derived from what it is *of* (a rule
        // with a medication generates doses) and stated by the surface for the
        // kinds that have nothing to infer from. Never a control, for the same
        // reason a moment's kind never is — see `schemas/routines.py`.
        "kind",
        // Both belong to `occasion` rules, which this surface is scoped away
        // from (`listParams`): a dose takes no time and has no wall-clock slot
        // to hold in a zone. They are edited where a recurring series is —
        // the calendar — not on a page about medications and habits.
        "expected_minutes",
        "timezone",
      ]}
    >
      <RecordSection>
        <F.Title field="activity" placeholder="What's the routine?" />
        <F.Text field="name" label="Name" />
        <F.Select field="status" label="Status" options={ROUTINE_STATUS} />
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
        <F.Ref field="protocol_id" label="Protocol" lookup="protocol" />
        <F.Ref field="area_id" label="Area" lookup="area" />
        <F.Ref field="program_id" label="Program" lookup="program" />
        <F.Ref field="responsible_id" label="Responsible" lookup="people" />
        <F.Text field="tracking_method" label="Tracking method" />
        <F.Textarea field="rationale" label="Why / prescribed by" />
      </RecordSection>
    </Record>
  )
}
