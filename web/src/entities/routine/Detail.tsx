import { Record, RecordSection } from "@/components/record/Record"
import { RoutineDetail as RoutineConsistency } from "@/components/detail/planning"
import { recordFields } from "@/components/record/typed"
import { Repeat } from "lucide-react"
import { SLOTS, WEEKDAYS } from "@/lib/slots"
import { summarizeCadence } from "@/lib/moments"
import { ROUTINE_STATUS } from "@/services/api/enums"
import { REGISTRY } from "@/services/api/registry"
import type { Entity, Routine } from "@/services/api/types"

const F = recordFields<Routine>()

/** Months as the column stores them. Numbers, because that is what a cadence
 *  holds; the series heading says it in words. */
const MONTH_NUMBERS = ["1","2","3","4","5","6","7","8","9","10","11","12"] as const

/**
 * A recurring occasion: the series behind everything the calendar draws for it.
 *
 * Its occurrences are computed and never stored (decision 10), so there is no
 * list of them here to edit — what you change is the cadence, and every
 * untouched occurrence follows. The ones that *did* change are moments in their
 * own right and live on the calendar where they happen.
 */
function SeriesDetail({ entity, onClose }: { entity: Entity; onClose: () => void }) {
  const rule = entity as Routine
  return (
    <Record
      def={REGISTRY.routine}
      entity={entity}
      onClose={onClose}
      omit={[
        // The clinical half of the rule table. A meeting has no dose, no
        // medication and no protocol, and offering them would suggest it might.
        "amount",
        "unit",
        "medication_id",
        "protocol_id",
        "sort_order",
        "kind",
        "frequency",
        "preferred_days",
        "preferred_time",
        "tracking_method",
        "responsible_id",
        // Written by the calendar drag that created the series.
        "name",
      ]}
    >
      <RecordSection>
        <F.Title field="name" placeholder="What is this series?" />
      </RecordSection>

      <p className="flex items-center gap-1.5 text-sm text-slate-600">
        <Repeat size={14} className="text-slate-400" />
        {summarizeCadence(rule)}
      </p>

      <RecordSection title="Cadence">
        <F.MultiSelect field="days_of_week" label="Days" options={WEEKDAYS} />
        <F.Number field="interval_days" label="Every N days" />
        {/* The calendar family: a position rather than a stride. Empty months
            means every month; `week_of_month` with a weekday is "the nth such",
            and −1 is the last. A birthday is months=[6], day 17. */}
        <F.MultiSelect field="months" label="Months" options={MONTH_NUMBERS} />
        <F.Number field="day_of_month" label="Day of the month" />
        <F.Number field="week_of_month" label="Which week (−1 = last)" />
        <F.MultiSelect field="timing" label="Times of day" options={SLOTS} />
        <F.Number field="expected_minutes" label="Runs for (minutes)" />
      </RecordSection>

      <RecordSection title="In force">
        {/* Ending a series is editing its window, not deleting fifty-two rows:
            the occurrences were never rows. Everything before the end stays. */}
        <F.Date field="start_date" label="From" />
        <F.Date field="end_date" label="Until" />
        <F.Select field="status" label="Status" options={ROUTINE_STATUS} />
        {/* The zone the wall-clock times are in — what keeps a 9am series at
            9am across a daylight-saving boundary. */}
        <F.Text field="timezone" label="Timezone" placeholder="America/Los_Angeles" />
      </RecordSection>

      <RecordSection title="Filing">
        <F.Ref field="area_id" label="Area" lookup="area" />
        <F.Ref field="program_id" label="Program" lookup="program" />
        <F.Textarea field="rationale" label="Notes" />
      </RecordSection>
    </Record>
  )
}


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
  // A rule generating occasions is a meeting series, not a regimen step. Same
  // table, same cadence, entirely different question — asking a recurring
  // therapy appointment for its dose amount and its protocol is asking about
  // the machinery of a different domain.
  if ((entity as Routine).kind === "occasion") {
    return <SeriesDetail entity={entity} onClose={onClose} />
  }
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
        // The calendar family of the cadence — which months, which date, which
        // week. A dose is taken on a stride ("every other day"), never on a
        // position in the calendar ("the first Saturday"), so offering these
        // here would suggest a regimen can be scheduled in a way it cannot.
        "months",
        "day_of_month",
        "week_of_month",
        // Both belong to `occasion` rules, which this surface is scoped away
        // from (`listParams`): a dose takes no time and has no wall-clock slot
        // to hold in a zone. They are edited where a recurring series is —
        // the calendar — not on a page about medications and habits.
        "expected_minutes",
        "timezone",
      ]}
    >
      <RecordSection>
        <F.Title field="name" placeholder="What's the routine?" />
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
