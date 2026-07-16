import { useState } from "react"
import { Check } from "lucide-react"
import { Button, EmptyState, Input } from "@/components/ui/primitives"
import { StatusBadge } from "@/components/cells"
import { TaskRow } from "@/pages/TasksPage"
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
  MetricEntry,
  Priority,
  Program,
  Project,
  Routine,
  Task,
  TaskStatus,
} from "@/services/api/types"
import {
  Heatmap,
  ProgressRing,
  RelatedRow,
  ScheduleChips,
  Section,
  Segmented,
  StatTile,
  Timeline,
} from "@/components/detail/kit"
import { daysFromToday } from "@/components/detail/dates"

// --- Task: a command surface -------------------------------------------------
const TASK_STEPS: { value: TaskStatus; label: string }[] = [
  { value: "planned", label: "Planned" },
  { value: "in_progress", label: "In progress" },
  { value: "waiting", label: "Waiting" },
  { value: "completed", label: "Done" },
]
const PRIORITY_STEPS: { value: Priority; label: string }[] = [
  { value: "low", label: "Low" },
  { value: "medium", label: "Med" },
  { value: "high", label: "High" },
  { value: "urgent", label: "Urgent" },
]

export function TaskDetail({ entity }: { entity: Entity }) {
  const t = entity as Task
  const update = tasks.useUpdate()
  const set = (body: Record<string, unknown>) => update.mutate({ id: t.id, body })
  const offStep = !TASK_STEPS.some((s) => s.value === t.status)
  return (
    <div className="space-y-4">
      <Section title="Status" action={offStep ? <StatusBadge status={t.status} /> : undefined}>
        <Segmented
          options={TASK_STEPS}
          value={t.status}
          onChange={(v) => set({ status: v })}
        />
      </Section>
      <Section title="Priority">
        <Segmented
          options={PRIORITY_STEPS}
          value={t.priority}
          onChange={(v) => set({ priority: v })}
        />
      </Section>
      <div className="grid gap-4 sm:grid-cols-2">
        <Section title="Scheduled">
          <ScheduleChips value={t.scheduled_date} onSet={(d) => set({ scheduled_date: d })} />
        </Section>
        <Section title="Due">
          <ScheduleChips value={t.due_date} onSet={(d) => set({ due_date: d })} />
        </Section>
      </div>
    </div>
  )
}

// --- Project: progress + task board -----------------------------------------
function TaskGroup({ title, list }: { title: string; list: Task[] }) {
  if (list.length === 0) return null
  return (
    <div className="space-y-1">
      <div className="text-xs font-medium text-slate-500">
        {title} · {list.length}
      </div>
      <div className="overflow-hidden rounded-lg border border-slate-100">
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
        {list.length === 0 ? (
          <EmptyState>No tasks yet.</EmptyState>
        ) : (
          <div className="space-y-3">
            <TaskGroup title="In progress" list={inProgress} />
            <TaskGroup title="To do" list={todo} />
            <TaskGroup title="Done" list={done} />
          </div>
        )}
        <Input
          className="mt-2"
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
      {projs.length > 0 && (
        <Section title={`Projects · ${projs.length}`}>
          <div className="space-y-1.5">
            {projs.map((p) => (
              <RelatedRow
                key={p.id}
                to={`/projects/${p.id}`}
                title={p.name}
                badge={<StatusBadge status={p.status} />}
              />
            ))}
          </div>
        </Section>
      )}
    </div>
  )
}

// --- Goal: progress ring + linked projects ----------------------------------
function Sparkline({ entries }: { entries: MetricEntry[] }) {
  if (entries.length < 2) return null
  const sorted = [...entries].sort((a, b) => a.entry_date.localeCompare(b.entry_date))
  const vals = sorted.map((e) => e.value)
  const min = Math.min(...vals)
  const max = Math.max(...vals)
  const span = max - min || 1
  const w = 280
  const h = 48
  const pts = sorted
    .map((e, i) => {
      const x = (i / (sorted.length - 1)) * w
      const y = h - ((e.value - min) / span) * (h - 4) - 2
      return `${x.toFixed(1)},${y.toFixed(1)}`
    })
    .join(" ")
  return (
    <svg width="100%" viewBox={`0 0 ${w} ${h}`} className="text-indigo-500">
      <polyline points={pts} fill="none" stroke="currentColor" strokeWidth={1.5} />
    </svg>
  )
}

export function GoalDetail({ entity }: { entity: Entity }) {
  const goal = entity as Goal
  const linked = useGoalProjects(goal.id).data ?? []
  const progress = useGoalProgress(goal.id).data
  const entries = useMetricEntries(goal.metric_id).data ?? []
  const allProjects = projects.useList().data ?? []
  const link = useLinkGoalProject()
  const unlink = useUnlinkGoalProject()
  const [pick, setPick] = useState("")
  const linkedIds = new Set(linked.map((p) => p.id))
  const pct = goal.progress ?? progress?.from_projects ?? 0
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

      <Section title={`Linked projects · ${linked.length}`}>
        {linked.length === 0 ? (
          <p className="text-sm text-slate-400">None linked.</p>
        ) : (
          <ul className="space-y-1">
            {linked.map((p) => (
              <li
                key={p.id}
                className="flex items-center justify-between gap-2 rounded-lg border border-slate-100 px-3 py-2 text-sm"
              >
                <span className="min-w-0 flex-1 truncate text-slate-700">{p.name}</span>
                <StatusBadge status={p.status} />
                <button
                  className="text-xs text-slate-400 hover:text-red-600"
                  onClick={() => unlink.mutate({ goalId: goal.id, projectId: p.id })}
                >
                  unlink
                </button>
              </li>
            ))}
          </ul>
        )}
        <div className="mt-2 flex gap-2">
          <select
            className="w-full rounded-lg border border-slate-300 bg-surface px-3 py-1.5 text-sm text-slate-700"
            value={pick}
            onChange={(e) => setPick(e.target.value)}
          >
            <option value="">Link a project…</option>
            {allProjects
              .filter((p) => !linkedIds.has(p.id))
              .map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name}
                </option>
              ))}
          </select>
          <Button
            variant="secondary"
            onClick={() => {
              if (pick) {
                link.mutate({ goalId: goal.id, projectId: pick })
                setPick("")
              }
            }}
          >
            Link
          </Button>
        </div>
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

  const levels = new Map<string, number>()
  for (const i of doneInst) {
    const d = (i.completed_at ?? i.scheduled_date)?.slice(0, 10)
    if (d) levels.set(d, 3)
  }
  // streak: consecutive days back from today (today may be unlogged — grace).
  let streak = 0
  for (let offset = levels.has(new Date().toISOString().slice(0, 10)) ? 0 : 1; ; offset++) {
    const d = new Date()
    d.setDate(d.getDate() - offset)
    if (levels.has(d.toISOString().slice(0, 10))) streak++
    else break
  }
  const weekAgo = daysFromToday
  const thisWeek = doneInst.filter((i) => {
    const d = (i.completed_at ?? i.scheduled_date)?.slice(0, 10)
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
          <StatTile value={doneInst.length} label="Total" />
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
              title: "Logged",
              meta: i.notes ?? undefined,
              tone: "good" as const,
            }))}
          />
        </Section>
      )}
    </div>
  )
}
