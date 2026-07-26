import { useRef, useState } from "react"
import { Check, Plus, X } from "lucide-react"
import { Button, EmptyState, Input } from "@/components/ui/primitives"
import { StatusBadge } from "@/components/cells"
import { EntityPicker } from "@/components/graph/EntityPicker"
import { EntityRef } from "@/components/graph/EntityRef"
import { TaskRow } from "@/pages/TasksPage"
import { cn } from "@/lib/utils"
import {
  projects,
  tasks,
  useCompleteRoutine,
  useGoalProgress,
  useGoalProjects,
  useLinkGoalProject,
  useMetricEntries,
  useRoutineInstances,
  useUnlinkGoalProject,
} from "@/services/api/hooks"
import type {
  Entity,
  Goal,
  Program,
  Project,
  Routine,
  Task,
} from "@/services/api/types"
import {
  Heatmap,
  ProgressRing,
  Section,
  Sparkline,
  StatTile,
  Timeline,
} from "@/components/detail/kit"
import { daysFromToday } from "@/components/detail/dates"
import { localDay, todayISO, ymd } from "@/lib/format"

// Task's detail surface moved to `entities/task/Detail.tsx` — it composes the
// `Record` primitives directly instead of inserting a fragment below the generic
// field grid.

// --- Project: progress + task board -----------------------------------------
function TaskGroup({
  title,
  list,
  capped,
}: {
  title: string
  list: Task[]
  capped?: boolean
}) {
  if (list.length === 0) return null
  return (
    <div className="space-y-1">
      <div className="text-xs font-medium text-slate-500">
        {title} · {list.length}
      </div>
      {/* `capped` bounds low-priority groups (e.g. Done) so a long history
          scrolls in place instead of pushing the page down. */}
      <div
        className={cn(
          "rounded-lg border border-slate-100",
          capped ? "max-h-64 overflow-y-auto" : "overflow-hidden",
        )}
      >
        {list.map((t) => (
          <TaskRow key={t.id} task={t} />
        ))}
      </div>
    </div>
  )
}

export function ProjectDetail({ entity }: { entity: Entity }) {
  const project = entity as Project
  const { data } = tasks.useList({ project_id: project.id, include_closed: "true" })
  const update = projects.useUpdate()
  const createTask = tasks.useCreate()
  const [next, setNext] = useState(project.next_action ?? "")
  const [newTask, setNewTask] = useState("")
  const list = data ?? []
  const done = list.filter((t) => t.status === "completed")
  const cancelled = list.filter((t) => t.status === "cancelled")
  const open = list.filter((t) => t.status !== "completed" && t.status !== "cancelled")
  const inProgress = open.filter((t) => t.status === "in_progress")
  const todo = open.filter((t) => t.status !== "in_progress")
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

      <Section title="Next action">
        <div className="flex gap-2">
          <Input
            value={next}
            onChange={(e) => setNext(e.target.value)}
            placeholder="What's the very next step?"
          />
          <Button
            variant="secondary"
            onClick={() => update.mutate({ id: project.id, body: { next_action: next || null } })}
          >
            Save
          </Button>
        </div>
      </Section>

      <Section title="Tasks">
        <Input
          value={newTask}
          placeholder="Add a task…"
          onChange={(e) => setNewTask(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && newTask.trim()) {
              createTask.mutate({
                title: newTask.trim(),
                project_id: project.id,
                area_id: project.area_id,
                status: "planned",
              })
              setNewTask("")
            }
          }}
        />
        {list.length === 0 ? (
          <EmptyState>No tasks yet.</EmptyState>
        ) : (
          <div className="space-y-3">
            <TaskGroup title="In progress" list={inProgress} />
            <TaskGroup title="To do" list={todo} />
            <TaskGroup title="Done" list={done} capped />
          </div>
        )}
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
  const targetD = daysFromToday(prog.target_date)
  return (
    <div className="space-y-5">
      <div className="flex items-center gap-4">
        <ProgressRing value={pct}>
          <span className="text-base font-semibold text-slate-900">{pct}%</span>
        </ProgressRing>
        <div className="grid flex-1 grid-cols-3 gap-2">
          <StatTile value={active.length} label="Active" />
          <StatTile value={done.length} label="Done" />
          {prog.target_date ? (
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

// --- Goal: progress ring + linked projects ----------------------------------
export function GoalDetail({ entity }: { entity: Entity }) {
  const goal = entity as Goal
  const linked = useGoalProjects(goal.id).data ?? []
  const progress = useGoalProgress(goal.id).data
  const entries = useMetricEntries(goal.metric_id).data ?? []
  const link = useLinkGoalProject()
  const unlink = useUnlinkGoalProject()
  const [pickOpen, setPickOpen] = useState(false)
  const addRef = useRef<HTMLButtonElement>(null)
  // Match the list: honor manual → metric → projects (the endpoint's `overall`).
  const pct = progress?.overall ?? goal.progress ?? 0
  const targetD = daysFromToday(goal.target_date)

  return (
    <div className="space-y-5">
      <div className="flex items-center gap-4">
        <ProgressRing value={pct} size={84}>
          <span className="text-lg font-semibold text-slate-900">{Math.round(pct)}%</span>
        </ProgressRing>
        <div className="grid flex-1 grid-cols-2 gap-2">
          <StatTile
            value={`${progress?.completed_projects ?? 0}/${progress?.linked_projects ?? linked.length}`}
            label="Projects done"
          />
          {goal.target_date ? (
            <StatTile
              value={Math.abs(targetD ?? 0)}
              label={targetD !== null && targetD < 0 ? "days over" : "days to target"}
              tone={targetD !== null && targetD < 0 ? "danger" : "default"}
            />
          ) : goal.target_value != null ? (
            <StatTile value={goal.target_value} label="Target" />
          ) : null}
        </div>
      </div>

      {goal.metric_id && entries.length >= 2 && (
        <Section title="Metric trend">
          <Sparkline entries={entries} />
        </Section>
      )}

      <Section
        title={`Linked projects · ${linked.length}`}
        action={
          <button
            ref={addRef}
            type="button"
            onClick={() => setPickOpen(true)}
            className="inline-flex items-center gap-1 rounded-lg px-2 py-1 text-xs font-medium text-slate-500 transition hover:bg-slate-100 hover:text-slate-800"
          >
            <Plus size={13} /> Link
          </button>
        }
      >
        {linked.length === 0 ? (
          <p className="text-sm text-slate-400">None linked.</p>
        ) : (
          <ul className="max-h-80 space-y-1 overflow-y-auto pr-1">
            {linked.map((p) => (
              <li
                key={p.id}
                className="flex items-center gap-2 rounded-lg border border-slate-100 bg-surface px-3 py-2 text-sm"
              >
                <EntityRef
                  type="project"
                  id={p.id}
                  className="min-w-0 flex-1 break-words text-slate-700"
                >
                  {p.name}
                </EntityRef>
                <StatusBadge status={p.status} />
                <button
                  type="button"
                  title="Unlink"
                  className="shrink-0 rounded p-0.5 text-slate-300 hover:text-red-600"
                  onClick={() => unlink.mutate({ goalId: goal.id, projectId: p.id })}
                >
                  <X size={14} />
                </button>
              </li>
            ))}
          </ul>
        )}
        {pickOpen && (
          <EntityPicker
            getAnchor={() => addRef.current}
            type="project"
            intent="assign"
            placeholder="Link a project…"
            onClose={() => setPickOpen(false)}
            onSelect={(sel) => {
              link.mutate({ goalId: goal.id, projectId: sel.id })
              setPickOpen(false)
            }}
          />
        )}
      </Section>
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
              meta: [i.ad_hoc ? "extra" : null, i.notes]
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
