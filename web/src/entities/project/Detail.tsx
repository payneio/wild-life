import { Record, RecordSection } from "@/components/record/Record"
import { ProjectDetail as ProjectBoard } from "@/components/detail/planning"
import { recordFields } from "@/components/record/typed"
import { PRIORITIES, PROJECT_STATUS } from "@/services/api/enums"
import { REGISTRY } from "@/services/api/registry"
import type { Entity, Project } from "@/services/api/types"

const F = recordFields<Project>()


/**
 * A container you operate: the progress ring and task board are the §5 view and
 * carry the page, so they sit high, with the framing fields beneath.
 *
 * `next_action` is a plain field here. The board renders its own next-action
 * input with a Save button — the one place in the app that still had an explicit
 * save — so the two are the same column reached two ways; editing either works.
 */
export function ProjectDetail({ entity, onClose }: { entity: Entity; onClose: () => void }) {
  return (
    <Record def={REGISTRY.project} entity={entity} onClose={onClose}>
      <RecordSection>
        <F.Title field="name" placeholder="Project name" />
      </RecordSection>

      <ProjectBoard entity={entity} />

      <RecordSection>
        <F.Select field="status" label="Status" options={PROJECT_STATUS} />
        <F.Select field="priority" label="Priority" options={PRIORITIES} />
        <F.Text field="next_action" label="Next action" full />
      </RecordSection>

      <RecordSection title="Purpose">
        {/* What this is and what it is for. Completion criteria are "Done when"
            outcomes — testable claims rather than a paragraph nothing checks. */}
        <F.Textarea field="purpose" label="Purpose" minRows={3} />
      </RecordSection>

      <RecordSection title="Dates">
        <F.Date field="start_date" label="Start" />
        <F.Date field="target_date" label="Target" />
        <F.Date field="last_activity_date" label="Last activity" />
        {/* How often this expects to be *examined* — a different question from
            whether work happened inside it. Usually left blank: the cadence
            inherits from the program above unless this one needs its own. */}
        <F.Text field="review_frequency" label="Review frequency" placeholder="inherits" />
      </RecordSection>

      <RecordSection title="Context & ownership">
        {/* The program is the whole of the project's placement — its area is the
            program's, not a second field that could disagree. */}
        <F.Ref field="program_id" label="Program" lookup="program" required />
        <F.Ref field="accountable_owner_id" label="Accountable" lookup="people" />
        <F.Ref field="responsible_lead_id" label="Responsible lead" lookup="people" />
      </RecordSection>
    </Record>
  )
}
