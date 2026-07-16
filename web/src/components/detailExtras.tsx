import { useState, type ReactNode } from "react"
import { AffiliationsEditor } from "@/components/AffiliationsEditor"
import { StatusBadge } from "@/components/cells"
import { EntityForm, type FieldSpec } from "@/components/EntityForm"
import { Button, EmptyState, Input } from "@/components/ui/primitives"
import { TaskRow } from "@/pages/TasksPage"
import { formatDate } from "@/lib/utils"
import type { Body } from "@/services/api/crud"
import {
  goals,
  metricEntries,
  metrics,
  programs,
  projects,
  protocolItems,
  routines,
  tasks,
  useCompleteRoutine,
  useGoalProgress,
  useGoalProjects,
  useLinkGoalProject,
  useMetricEntries,
  useProtocolItems,
  useRoutineInstances,
  useUnlinkGoalProject,
} from "@/services/api/hooks"
import type {
  Area,
  Entity,
  Goal,
  Metric,
  MetricEntry,
  Project,
  Protocol,
  ProtocolItem,
  Routine,
} from "@/services/api/types"

function ExtraSection({ title, children }: { title: string; children: ReactNode }) {
  return (
    <div>
      <h3 className="mb-1.5 text-xs font-semibold uppercase tracking-wide text-slate-400">
        {title}
      </h3>
      {children}
    </div>
  )
}

// --- Project: next action + tasks -------------------------------------------
export function ProjectExtra({ entity }: { entity: Entity }) {
  const project = entity as Project
  const { data } = tasks.useList({ project_id: project.id, include_closed: "true" })
  const update = projects.useUpdate()
  const createTask = tasks.useCreate()
  const [next, setNext] = useState(project.next_action ?? "")
  const [newTask, setNewTask] = useState("")
  const list = data ?? []
  return (
    <div className="space-y-4">
      <ExtraSection title="Next action">
        <div className="flex gap-2">
          <Input value={next} onChange={(e) => setNext(e.target.value)} placeholder="What's the very next step?" />
          <Button
            variant="secondary"
            onClick={() => update.mutate({ id: project.id, body: { next_action: next || null } })}
          >
            Save
          </Button>
        </div>
      </ExtraSection>
      <ExtraSection title={`Tasks (${list.length})`}>
        <div className="rounded-lg border border-slate-100">
          {list.length === 0 ? (
            <EmptyState>No tasks yet.</EmptyState>
          ) : (
            list.map((t) => <TaskRow key={t.id} task={t} />)
          )}
        </div>
        <div className="mt-2">
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
        </div>
      </ExtraSection>
    </div>
  )
}

// --- Area: rollup of children -----------------------------------------------
function Rollup({ title, items }: { title: string; items: { id: string; label: string }[] }) {
  return (
    <ExtraSection title={`${title} (${items.length})`}>
      {items.length === 0 ? (
        <p className="text-sm text-slate-400">—</p>
      ) : (
        <ul className="space-y-0.5 text-sm text-slate-700">
          {items.map((i) => (
            <li key={i.id}>{i.label}</li>
          ))}
        </ul>
      )}
    </ExtraSection>
  )
}

export function AreaExtra({ entity }: { entity: Entity }) {
  const area = entity as Area
  const byArea = { area_id: area.id }
  const progs = programs.useList(byArea).data ?? []
  const projs = projects.useList(byArea).data ?? []
  const gs = goals.useList(byArea).data ?? []
  const rs = routines.useList(byArea).data ?? []
  const ms = metrics.useList(byArea).data ?? []
  return (
    <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
      <Rollup title="Programs" items={progs.map((p) => ({ id: p.id, label: p.name }))} />
      <Rollup title="Projects" items={projs.map((p) => ({ id: p.id, label: p.name }))} />
      <Rollup title="Goals" items={gs.map((g) => ({ id: g.id, label: g.name }))} />
      <Rollup title="Routines" items={rs.map((r) => ({ id: r.id, label: r.name }))} />
      <Rollup title="Metrics" items={ms.map((m) => ({ id: m.id, label: m.name }))} />
    </div>
  )
}

// --- Goal: progress + linked projects ---------------------------------------
function ProgressBar({ pct }: { pct: number }) {
  return (
    <div className="h-2 w-full overflow-hidden rounded-full bg-slate-100">
      <div className="h-full bg-indigo-500" style={{ width: `${Math.min(100, Math.max(0, pct))}%` }} />
    </div>
  )
}

export function GoalExtra({ entity }: { entity: Entity }) {
  const goal = entity as Goal
  const linked = useGoalProjects(goal.id).data ?? []
  const progress = useGoalProgress(goal.id).data
  const allProjects = projects.useList().data ?? []
  const link = useLinkGoalProject()
  const unlink = useUnlinkGoalProject()
  const [pick, setPick] = useState("")
  const linkedIds = new Set(linked.map((p) => p.id))
  const pct = goal.progress ?? progress?.from_projects ?? 0
  return (
    <div className="space-y-4">
      <ExtraSection title="Progress">
        <div className="mb-1 flex justify-between text-sm">
          <span className="text-slate-500">
            {progress ? `${progress.completed_projects}/${progress.linked_projects} projects done` : ""}
          </span>
          <span className="font-medium">{Math.round(pct)}%</span>
        </div>
        <ProgressBar pct={pct} />
      </ExtraSection>
      <ExtraSection title="Linked projects">
        {linked.length === 0 ? (
          <p className="text-sm text-slate-400">None linked.</p>
        ) : (
          <ul className="space-y-1 text-sm">
            {linked.map((p) => (
              <li key={p.id} className="flex items-center justify-between">
                <span>{p.name}</span>
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
            className="w-full rounded-lg border border-slate-300 bg-surface px-3 py-1.5 text-sm"
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
      </ExtraSection>
    </div>
  )
}

// --- Metric: trend + entries ------------------------------------------------
function Sparkline({ entries }: { entries: MetricEntry[] }) {
  if (entries.length < 2) return null
  const sorted = [...entries].sort((a, b) => a.entry_date.localeCompare(b.entry_date))
  const vals = sorted.map((e) => e.value)
  const min = Math.min(...vals)
  const max = Math.max(...vals)
  const span = max - min || 1
  const w = 240
  const h = 40
  const pts = sorted
    .map((e, i) => {
      const x = (i / (sorted.length - 1)) * w
      const y = h - ((e.value - min) / span) * h
      return `${x.toFixed(1)},${y.toFixed(1)}`
    })
    .join(" ")
  return (
    <svg width={w} height={h} className="text-indigo-500">
      <polyline points={pts} fill="none" stroke="currentColor" strokeWidth={1.5} />
    </svg>
  )
}

export function MetricExtra({ entity }: { entity: Entity }) {
  const metric = entity as Metric
  const { data } = useMetricEntries(metric.id)
  const create = metricEntries.useCreate()
  const [value, setValue] = useState("")
  const [date, setDate] = useState("")
  const list = data ?? []
  const recent = [...list].sort((a, b) => b.entry_date.localeCompare(a.entry_date))
  return (
    <div className="space-y-3">
      <ExtraSection title="Trend">
        {list.length < 2 ? <p className="text-sm text-slate-400">Need ≥2 entries.</p> : <Sparkline entries={list} />}
      </ExtraSection>
      <div className="flex gap-2">
        <Input type="date" value={date} onChange={(e) => setDate(e.target.value)} />
        <Input
          type="number"
          placeholder={metric.unit ?? "value"}
          value={value}
          onChange={(e) => setValue(e.target.value)}
        />
        <Button
          variant="secondary"
          onClick={() => {
            if (value) {
              create.mutate({
                metric_id: metric.id,
                value: Number(value),
                entry_date: date || new Date().toISOString().slice(0, 10),
              })
              setValue("")
              setDate("")
            }
          }}
        >
          Add
        </Button>
      </div>
      <ExtraSection title={`Entries (${list.length})`}>
        {list.length === 0 ? (
          <p className="text-sm text-slate-400">No entries yet.</p>
        ) : (
          <ul className="max-h-48 space-y-1 overflow-y-auto text-sm">
            {recent.map((e) => (
              <li key={e.id} className="flex justify-between border-b border-slate-50 py-1">
                <span>{formatDate(e.entry_date)}</span>
                <span className="font-medium">
                  {e.value}
                  {metric.unit ? ` ${metric.unit}` : ""}
                </span>
              </li>
            ))}
          </ul>
        )}
      </ExtraSection>
    </div>
  )
}

// --- Routine: complete + history --------------------------------------------
export function RoutineExtra({ entity }: { entity: Entity }) {
  const routine = entity as Routine
  const { data } = useRoutineInstances(routine.id)
  const complete = useCompleteRoutine()
  const list = data ?? []
  const done = list.filter((i) => i.status === "done").length
  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <span className="text-sm text-slate-500">{done} completions logged</span>
        <Button variant="secondary" onClick={() => complete.mutate({ id: routine.id })}>
          Log today
        </Button>
      </div>
      <ExtraSection title="History">
        {list.length === 0 ? (
          <EmptyState>No completions yet.</EmptyState>
        ) : (
          <ul className="max-h-64 space-y-1 overflow-y-auto text-sm">
            {list.map((i) => (
              <li key={i.id} className="flex justify-between border-b border-slate-50 py-1">
                <span>{formatDate(i.scheduled_date)}</span>
                <StatusBadge status={i.status} />
              </li>
            ))}
          </ul>
        )}
      </ExtraSection>
    </div>
  )
}

// --- Protocol: dosed steps --------------------------------------------------
const PROTOCOL_ITEM_FIELDS: FieldSpec[] = [
  { name: "substance", label: "Substance" },
  { name: "medication_id", label: "Or link medication", type: "entity", lookup: "medication" },
  { name: "amount", label: "Amount", placeholder: "1" },
  { name: "timing", label: "Timing", type: "tags", full: true, placeholder: "breakfast, dinner" },
  { name: "frequency", label: "Frequency" },
  { name: "trigger", label: "Trigger / condition", full: true },
  { name: "notes", label: "Notes", type: "textarea", full: true },
]

export function ProtocolExtra({ entity }: { entity: Entity }) {
  const protocol = entity as Protocol
  const { data } = useProtocolItems(protocol.id)
  const create = protocolItems.useCreate()
  const update = protocolItems.useUpdate()
  const remove = protocolItems.useRemove()
  const [editing, setEditing] = useState<ProtocolItem | null>(null)
  const [adding, setAdding] = useState(false)
  const list = data ?? []

  function submit(body: Body) {
    if (editing) update.mutate({ id: editing.id, body })
    else create.mutate({ ...body, protocol_id: protocol.id, sort_order: list.length })
    setEditing(null)
    setAdding(false)
  }

  return (
    <ExtraSection title={`Steps (${list.length})`}>
      <div className="space-y-3">
        {list.length === 0 ? (
          <EmptyState>No steps yet.</EmptyState>
        ) : (
          <ul className="space-y-1 text-sm">
            {list.map((it) => (
              <li key={it.id} className="flex items-start justify-between gap-2 border-b border-slate-50 py-1.5">
                <div>
                  <span className="font-medium">{it.substance || "(linked med)"}</span>
                  {it.amount ? <span className="text-slate-400"> · {it.amount}</span> : null}
                  {it.timing?.length ? <span className="text-slate-500"> @ {it.timing.join(", ")}</span> : null}
                  {it.trigger ? <div className="text-xs text-amber-600">{it.trigger}</div> : null}
                </div>
                <div className="whitespace-nowrap">
                  <button className="rounded px-1 text-xs text-slate-400 hover:text-slate-700" onClick={() => { setEditing(it); setAdding(false) }}>
                    edit
                  </button>
                  <button className="rounded px-1 text-xs text-slate-400 hover:text-red-600" onClick={() => remove.mutate(it.id)}>
                    delete
                  </button>
                </div>
              </li>
            ))}
          </ul>
        )}
        {adding || editing ? (
          <EntityForm
            fields={PROTOCOL_ITEM_FIELDS}
            initial={editing ?? undefined}
            onSubmit={submit}
            onCancel={() => { setEditing(null); setAdding(false) }}
            submitLabel={editing ? "Save" : "Add step"}
          />
        ) : (
          <Button variant="secondary" onClick={() => setAdding(true)}>
            Add step
          </Button>
        )}
      </div>
    </ExtraSection>
  )
}

// --- Organization: members --------------------------------------------------
export function OrganizationExtra({ entity }: { entity: Entity }) {
  return (
    <ExtraSection title="Members">
      <AffiliationsEditor organizationId={entity.id} />
    </ExtraSection>
  )
}
