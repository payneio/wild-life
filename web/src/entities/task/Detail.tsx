import { Record, RecordSection } from "@/components/record/Record"
import { useField } from "@/components/record/context"
import { recordFields } from "@/components/record/typed"
import { ScheduleChips, Segmented } from "@/components/detail/kit"
import { OFF_LANE, STEPS } from "@/entities/task/status"
import { REGISTRY } from "@/services/api/registry"
import type { Entity, Priority, Task, TaskStatus } from "@/services/api/types"
import type { CalendarDay } from "@/lib/date"

const F = recordFields<Task>()


const PRIORITIES: { value: Priority; label: string }[] = [
  { value: "low", label: "Low" },
  { value: "medium", label: "Med" },
  { value: "high", label: "High" },
  { value: "urgent", label: "Urgent" },
]

/**
 * Status as a lane plus an escape hatch. The lane covers the four states a task
 * actually moves through; the select carries the other four so every value the
 * column accepts is still reachable — the old segmented control silently made
 * `cancelled` and `delegated` unsettable from the detail page.
 */
function StatusField() {
  const { value, save } = useField("status")
  const status = value as TaskStatus
  const offLane = OFF_LANE.includes(status)
  return (
    <RecordSection
      title="Status"
      columns={false}
      action={
        <select
          value={offLane ? status : ""}
          onChange={(e) => e.target.value && save(e.target.value)}
          className="rounded-md border border-slate-200 bg-transparent px-1.5 py-0.5 text-xs text-slate-500 transition hover:border-slate-300 focus:outline-none"
        >
          <option value="">More…</option>
          {OFF_LANE.map((s) => (
            <option key={s} value={s}>
              {s.replace(/_/g, " ")}
            </option>
          ))}
        </select>
      }
    >
      <Segmented
        options={STEPS}
        value={offLane ? undefined : status}
        onChange={(v) => save(v)}
      />
    </RecordSection>
  )
}

function PriorityField() {
  const { value, save } = useField("priority")
  return (
    <RecordSection title="Priority" columns={false}>
      <Segmented options={PRIORITIES} value={value as Priority} onChange={(v) => save(v)} />
    </RecordSection>
  )
}

/** Quick-set chips over a date column. */
function DateChips({ field }: { field: "scheduled_date" | "due_date" }) {
  const { value, save } = useField(field)
  return <ScheduleChips value={value as CalendarDay | null} onSet={(d) => save(d)} />
}

export function TaskDetail({ entity, onClose }: { entity: Entity; onClose: () => void }) {
  return (
    <Record
      def={REGISTRY.task}
      entity={entity}
      onClose={onClose}
      omit={[
        // Derived from `status` by the backend's _sync_completion.
        "completed_at",
        // Set by the worker-token claim flow, never edited by hand.
        "claimed_by_id",
        "claimed_at",
        // Rank among siblings. It has no meaning on its own — a number you
        // could type here would say nothing without the list beside it — so it
        // is expressed by dragging on the board and nowhere else.
        "position",
      ]}
    >
      <div className="grid grid-cols-1 gap-x-6 gap-y-3 sm:grid-cols-2">
        <F.Title field="title" placeholder="What needs doing?" />
      </div>

      {/* The command surface sits directly under the title: status, priority and
          dates are what you come here to change, so they lead rather than
          trailing fifteen reference fields. */}
      <StatusField />
      <PriorityField />

      <RecordSection title="Scheduling">
        <div>
          <div className="text-[11px] font-medium uppercase tracking-wide text-slate-400">
            Scheduled
          </div>
          <div className="mt-0.5 space-y-1.5">
            <DateChips field="scheduled_date" />
            <F.Time field="scheduled_time" />
          </div>
        </div>
        <div>
          <div className="text-[11px] font-medium uppercase tracking-wide text-slate-400">Due</div>
          <div className="mt-0.5">
            <DateChips field="due_date" />
          </div>
        </div>
        <F.Number field="estimated_minutes" label="Estimate (min)" placeholder="—" />
        <F.Recurrence field="recurrence" label="Recurrence" />
      </RecordSection>

      <RecordSection title="Detail">
        <F.Textarea field="description" label="Description" />
      </RecordSection>

      <RecordSection title="Where it lives">
        {/* One scope, at whatever altitude — usually a project, sometimes an
            area for a single action that has no project and should not have one
            invented for it. Three separate pickers implied a task could sit in
            three places, which is how the copies drifted apart. */}
        <F.Root label="Scope" typeField="scope_type" idField="scope_id" />
        <F.Ref field="blocked_by_task_id" label="Blocked by" lookup="task" />
      </RecordSection>

      {/* Why this ended, when it has. `discharged` is written by completing;
          `abandoned` and `voided` look identical in a status and are the
          distinction valence attaches to — dropping something you should never
          have committed to is good judgement, letting it rot is not. */}
      <RecordSection title="Ending">
        <F.Text field="ending_cause" label="Cause" placeholder="open" />
        <F.Textarea field="ending_note" label="Why" />
      </RecordSection>

      <RecordSection title="Ownership">
        <F.Ref field="assignee_id" label="Assignee" lookup="people" />
        <F.Ref field="responsible_id" label="Responsible" lookup="people" />
        <F.Ref field="accountable_owner_id" label="Accountable" lookup="people" />
        <F.Text field="waiting_on" label="Waiting on" />
        <F.Checkbox field="acceptance_required" label="Requires acceptance" />
      </RecordSection>
    </Record>
  )
}
