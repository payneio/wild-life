import { Record, RecordSection } from "@/components/record/Record"
import {
  ProgramDetail as ProgramStats,
  ProgramTimeline,
} from "@/components/detail/planning"
import { recordFields } from "@/components/record/typed"
import { HEALTH_CATEGORY, PROGRAM_STATUS } from "@/services/api/enums"
import { REGISTRY } from "@/services/api/registry"
import type { Entity, Program } from "@/services/api/types"

const F = recordFields<Program>()


/**
 * A program is anything you have decided to pay attention to — an effort you are
 * mounting or a condition you are carrying. Those were two tables until the data
 * said otherwise: every health program was already a shadow of a condition, with
 * the measurements on one and the treatment on the other.
 *
 * So this one layout serves both. The clinical parts appear because the program
 * has them (`involves`), never because something checked which area you are in.
 * The timeline is not one of those: every program has a history, and a clinical
 * one's history is its course of care.
 */
export function ProgramDetail({ entity, onClose }: { entity: Entity; onClose: () => void }) {
  const program = entity as Program
  return (
    <Record def={REGISTRY.program} entity={entity} onClose={onClose}>
      <RecordSection>
        <F.Title field="name" placeholder="Program name" />
      </RecordSection>

      <ProgramStats entity={entity} />
      {/* The program's dated history — the events filed under it — plus a place
          to record one. A band rather than a relation panel, so it can't be
          absent on the program you need it on (see `ProgramTimeline`). */}
      <ProgramTimeline entity={entity} />

      <RecordSection>
        <F.Select field="status" label="Status" options={PROGRAM_STATUS} />
        <F.Ref field="area_id" label="Area" lookup="area" />
        <F.Date field="start_date" label="Started" />
        <F.Date field="ended_date" label="Ended" />
      </RecordSection>

      <RecordSection title="Purpose">
        {/* What this is and what it is for, in one statement. What must be
            *true* is the Outcomes panel below. */}
        <F.Textarea field="purpose" label="Purpose" minRows={3} />
      </RecordSection>

      {/* The health facet, offered once a program says it's clinical. `category`
          is the one field that only means something for those. */}
      {(program.category || program.involves.length > 0) && (
        <RecordSection title="Clinical">
          <F.Select field="category" label="Category" options={HEALTH_CATEGORY} />
        </RecordSection>
      )}

      <RecordSection title="Ownership & cadence">
        <F.Ref field="accountable_owner_id" label="Accountable" lookup="people" />
        <F.Ref field="responsible_lead_id" label="Responsible lead" lookup="people" />
        <F.Text field="review_frequency" label="Review frequency" placeholder="monthly" />
        <F.Text field="reporting_cadence" label="Reporting cadence" placeholder="quarterly" />
      </RecordSection>
    </Record>
  )
}
