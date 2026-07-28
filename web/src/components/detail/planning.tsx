import { useRef, useState } from "react"
import { Check, Plus } from "lucide-react"
import { Button, Input } from "@/components/ui/primitives"
import { EntityPicker } from "@/components/graph/EntityPicker"
import { EventCapture } from "@/entities/event/Capture"
import {
  events,
  projects,
  tasks,
  useCompleteRoutine,
  useMetricEntries,
  useOutcomeEvaluation,
  useRoutineInstances,
} from "@/services/api/hooks"
import { useMetricLookup } from "@/services/api/lookups"
import type {
  Entity,
  Outcome,
  Program,
  Project,
  Routine,
} from "@/services/api/types"
import {
  Heatmap,
  ProgressRing,
  Section,
  Sparkline,
  StatTile,
  Timeline,
  type TimelineItem,
} from "@/components/detail/kit"
import { TaskBoard } from "@/components/detail/TaskBoard"
import { daysFromToday } from "@/components/detail/dates"
import { formatBand, formatInstant, humanize, localDay, todayISO, ymd } from "@/lib/format"

// Task's detail surface moved to `entities/task/Detail.tsx` — it composes the
// `Record` primitives directly instead of inserting a fragment below the generic
// field grid.

// --- Project: progress + task board -----------------------------------------
export function ProjectDetail({ entity }: { entity: Entity }) {
  const project = entity as Project
  const { data } = tasks.useList({ project_id: project.id, include_closed: "true" })
  const createTask = tasks.useCreate()
  const [newTask, setNewTask] = useState("")
  const list = data ?? []
  const done = list.filter((t) => t.status === "completed")
  const cancelled = list.filter((t) => t.status === "cancelled")
  const open = list.filter((t) => t.status !== "completed" && t.status !== "cancelled")
  const pct = list.length ? Math.round((done.length / (list.length - cancelled.length || 1)) * 100) : 0
  const targetD = daysFromToday(project.target_date)

  return (
    <div className="space-y-5">
      <div className="flex items-center gap-4">
        <ProgressRing value={pct}>
          <span className="text-base font-semibold text-slate-900">{pct}%</span>
        </ProgressRing>
        <div className="grid flex-1 grid-cols-3 gap-2">
          <StatTile value={open.length} label="Open" tone={open.length ? "default" : "good"} />
          <StatTile value={done.length} label="Done" />
          {project.target_date ? (
            <StatTile
              value={Math.abs(targetD ?? 0)}
              label={targetD !== null && targetD < 0 ? "days over" : "days to target"}
              tone={targetD !== null && targetD < 0 ? "danger" : "default"}
            />
          ) : (
            <StatTile value={list.length} label="Total" />
          )}
        </div>
      </div>

      {/* `next_action` is rendered once, by the layout in `entities/project`.
          The board used to carry a second input for the same column with its own
          Save button — the last explicit save in the app — which is the exact
          two-renderers-one-field arrangement `Record` exists to prevent. */}

      <Section title="Tasks">
        <Input
          value={newTask}
          placeholder="Add a task…"
          onChange={(e) => setNewTask(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && newTask.trim()) {
              // The project and nothing else. Copying an area down beside it is
              // exactly what let the two drift apart; the area is a join away.
              // Rank is left off too — the API puts a new capture last.
              createTask.mutate({
                title: newTask.trim(),
                project_id: project.id,
                status: "planned",
              })
              setNewTask("")
            }
          }}
        />
        <TaskBoard tasks={list} />
      </Section>
    </div>
  )
}

// --- Program: a portfolio of projects ---------------------------------------
export function ProgramDetail({ entity }: { entity: Entity }) {
  const prog = entity as Program
  const projs = projects.useList({ program_id: prog.id }).data ?? []
  const cancelled = projs.filter((p) => p.status === "cancelled")
  const done = projs.filter((p) => p.status === "completed")
  const active = projs.filter(
    (p) => !["completed", "cancelled", "archived"].includes(p.status),
  )
  const denom = projs.length - cancelled.length || 1
  const pct = projs.length ? Math.round((done.length / denom) * 100) : 0
  const targetD = daysFromToday(prog.ended_date)
  return (
    <div className="space-y-5">
      <div className="flex items-center gap-4">
        <ProgressRing value={pct}>
          <span className="text-base font-semibold text-slate-900">{pct}%</span>
        </ProgressRing>
        <div className="grid flex-1 grid-cols-3 gap-2">
          <StatTile value={active.length} label="Active" />
          <StatTile value={done.length} label="Done" />
          {prog.ended_date ? (
            <StatTile
              value={Math.abs(targetD ?? 0)}
              label={targetD !== null && targetD < 0 ? "days over" : "days to target"}
              tone={targetD !== null && targetD < 0 ? "danger" : "default"}
            />
          ) : (
            <StatTile value={projs.length} label="Projects" />
          )}
        </div>
      </div>
      {/* The navigable, addable Projects list is rendered by the generic
          RelatedPanel from `program.relations`. */}
    </div>
  )
}

/**
 * A program's dated history: the events filed under it, plus its own start and
 * end. Events are *temporal* (ui-architecture §5), so they earn this rendering
 * instead of the generic list — and having earned it, they must not also keep
 * the generic one. They did: the same 21 events rendered twice on the IMO page,
 * once here and once in an `Events · 21` panel five panels further down, which
 * is also where the only way to record one had been sitting unfound.
 *
 * So this is a **band**, not a declared relation, for the reason the Log is one:
 * a panel that can be absent can be forgotten, and "where do I record what
 * happened?" has to be answerable by navigation alone. It renders on every
 * program, empty or not, which is what lets the first event be recorded at all.
 * Filing an event elsewhere, or removing it from here, is done on the event —
 * its `About` field is the same two columns this writes.
 */
export function ProgramTimeline({ entity }: { entity: Entity }) {
  const prog = entity as Program
  const evts = events.useList({ entity_type: "program", entity_id: prog.id }).data ?? []
  const update = events.useUpdate()
  const [linking, setLinking] = useState(false)
  const linkRef = useRef<HTMLButtonElement>(null)

  const items: TimelineItem[] = []
  for (const e of evts)
    items.push({
      key: `e${e.id}`,
      date: e.start_at ? e.start_at.slice(0, 10) : null,
      title: e.title,
      meta: e.event_type ? humanize(e.event_type) : "",
      to: `/calendar/${e.id}`,
      tone: "accent",
    })
  if (prog.start_date) items.push({ key: "start", date: prog.start_date, title: "Started" })
  if (prog.ended_date)
    items.push({ key: "ended", date: prog.ended_date, title: "Ended", tone: "good" })
  items.sort((a, b) => (b.date ?? "").localeCompare(a.date ?? ""))

  return (
    <Section
      title="Timeline"
      action={
        // Recording something new is the common case and gets the field; an
        // event that already exists (scheduled on the calendar, then filed here)
        // is the rarer one and gets the picker the generic panel used to offer.
        <button
          ref={linkRef}
          type="button"
          onClick={() => setLinking(true)}
          className="inline-flex items-center gap-1 rounded-lg px-2 py-1 text-xs font-medium text-slate-500 transition hover:bg-slate-100 hover:text-slate-800"
        >
          <Plus size={13} /> Link
        </button>
      }
    >
      <EventCapture root={{ type: "program", id: prog.id }} />
      {items.length === 0 ? (
        <p className="text-sm text-slate-400">Nothing recorded yet.</p>
      ) : (
        <Timeline items={items} />
      )}
      {linking && (
        <EntityPicker
          getAnchor={() => linkRef.current}
          type="event"
          intent="assign"
          placeholder="Link an event…"
          onClose={() => setLinking(false)}
          onSelect={(sel) => {
            update.mutate({
              id: sel.id,
              body: { entity_type: "program", entity_id: prog.id },
            })
            setLinking(false)
          }}
        />
      )}
    </Section>
  )
}

// --- Outcome: the verdict, and the reading it rests on ----------------------
/** State first, number second.

 *  The old ring showed a single percentage blended from three sources, which
 *  read as precision it didn't have — a goal with no readings still drew a
 *  confident 0%. Progress only exists for a target travelling from a baseline;
 *  a standard is in its band or it isn't, and an unmeasured claim says so. */
const STATE_LABEL: Record<string, string> = {
  met: "In band",
  breached: "Breached",
  achieved: "Achieved",
  on_pace: "On pace",
  behind: "Behind",
  overdue: "Overdue",
  in_progress: "In progress",
  satisfied: "Satisfied",
  outstanding: "Outstanding",
  unmeasured: "Unmeasured",
  no_readings: "Never read",
}

const STATE_TONE: Record<string, "default" | "danger" | "good" | "muted"> = {
  met: "good",
  achieved: "good",
  on_pace: "good",
  satisfied: "good",
  breached: "danger",
  behind: "danger",
  overdue: "danger",
  unmeasured: "muted",
  no_readings: "muted",
}

export function OutcomeDetail({ entity }: { entity: Entity }) {
  const outcome = entity as Outcome
  const evaluation = useOutcomeEvaluation(outcome.id).data
  const entries = useMetricEntries(outcome.metric_id).data ?? []
  const metric = useMetricLookup().nameOf(outcome.metric_id)

  if (!evaluation) return null
  const state = evaluation.state
  const band = formatBand(evaluation.target_min, evaluation.target_max)

  return (
    <div className="space-y-5">
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
        <StatTile
          value={STATE_LABEL[state] ?? state}
          label={evaluation.is_stale ? "state · reading is stale" : "state"}
          tone={STATE_TONE[state] ?? "default"}
        />
        {evaluation.latest_value !== null && (
          <StatTile
            value={evaluation.latest_value}
            label={evaluation.latest_at ? `read ${formatInstant(evaluation.latest_at)}` : "latest"}
            tone={evaluation.is_stale ? "muted" : "default"}
          />
        )}
        {evaluation.progress !== null && (
          <StatTile value={`${Math.round(evaluation.progress)}%`} label="of the way" />
        )}
        {outcome.by_when && evaluation.days_remaining !== null && (
          <StatTile
            value={Math.abs(evaluation.days_remaining)}
            label={evaluation.days_remaining < 0 ? "days over" : "days left"}
            tone={evaluation.days_remaining < 0 ? "danger" : "default"}
          />
        )}
        {band && <StatTile value={band} label="target" tone="muted" />}
      </div>

      {state === "unmeasured" && (
        <p className="text-sm text-slate-500">
          No metric bound — this states what should be true but nothing reads it.
          That&rsquo;s a fine place to start; attach a metric below when there is one.
        </p>
      )}

      {outcome.metric_id && entries.length >= 2 && (
        <Section title={`Trend · ${metric ?? "metric"}`}>
          <Sparkline entries={entries} />
        </Section>
      )}
    </div>
  )
}

// --- Routine: consistency heatmap + streak ----------------------------------
export function RoutineDetail({ entity }: { entity: Entity }) {
  const routine = entity as Routine
  const instances = useRoutineInstances(routine.id).data ?? []
  const complete = useCompleteRoutine()
  const doneInst = instances.filter((i) => i.status === "done")
  // Consistency counts the scheduled check-off (one per day); ad-hoc/extra doses
  // are shown in Recent but don't inflate the streak or per-day shading.
  const scheduledDone = doneInst.filter((i) => !i.ad_hoc)

  const levels = new Map<string, number>()
  for (const i of scheduledDone) {
    const raw = i.completed_at ?? i.scheduled_date
    if (raw) levels.set(localDay(raw), 3)
  }
  // streak: consecutive days back from today (today may be unlogged — grace).
  let streak = 0
  for (let offset = levels.has(todayISO()) ? 0 : 1; ; offset++) {
    const d = new Date()
    d.setDate(d.getDate() - offset)
    if (levels.has(ymd(d))) streak++
    else break
  }
  const weekAgo = daysFromToday
  const thisWeek = scheduledDone.filter((i) => {
    const raw = i.completed_at ?? i.scheduled_date
    const d = raw ? localDay(raw) : null
    const diff = d ? weekAgo(d) : null
    return diff !== null && diff > -7 && diff <= 0
  }).length

  const recent = [...doneInst]
    .sort((a, b) =>
      (b.completed_at ?? b.scheduled_date).localeCompare(a.completed_at ?? a.scheduled_date),
    )
    .slice(0, 8)

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between gap-3">
        <div className="grid flex-1 grid-cols-3 gap-2">
          <StatTile value={streak} label="Day streak" tone={streak ? "good" : "muted"} />
          <StatTile value={scheduledDone.length} label="Total" />
          <StatTile value={thisWeek} label="This week" />
        </div>
        <Button onClick={() => complete.mutate({ id: routine.id })}>
          <Check size={16} /> Log today
        </Button>
      </div>

      <Section title="Consistency · last 13 weeks">
        <Heatmap levels={levels} />
      </Section>

      {recent.length > 0 && (
        <Section title="Recent">
          <Timeline
            items={recent.map((i) => ({
              key: i.id,
              date: i.completed_at ?? i.scheduled_date,
              title:
                i.amount != null
                  ? `Logged · ${i.amount}${i.unit ? ` ${i.unit}` : ""}`
                  : "Logged",
              meta: [i.ad_hoc ? "extra" : null, i.context]
                .filter(Boolean)
                .join(" · ") || undefined,
              tone: i.ad_hoc ? ("accent" as const) : ("good" as const),
            }))}
          />
        </Section>
      )}
    </div>
  )
}
