import { useMemo, useState } from "react"
import { Outlet, useNavigate, useParams } from "react-router-dom"
import { Check, Plus } from "lucide-react"
import { EntityForm, type FieldSpec } from "@/components/EntityForm"
import { ListToolbar } from "@/components/ListToolbar"
import { DateText, PriorityBadge, RefName } from "@/components/cells"
import { Button, Card, EmptyState, Modal } from "@/components/ui/primitives"
import { useListFilter, type ListConfig } from "@/lib/listFilter"
import { cn } from "@/lib/utils"
import { tasks } from "@/services/api/hooks"
import type { Body } from "@/services/api/crud"
import type { Task } from "@/services/api/types"

const TASK_STATUS = [
  "inbox",
  "planned",
  "in_progress",
  "waiting",
  "delegated",
  "delivered",
  "completed",
  "cancelled",
] as const
const PRIORITIES = ["low", "medium", "high", "urgent"] as const

const FIELDS: FieldSpec[] = [
  { name: "title", label: "Title", full: true },
  { name: "description", label: "Description", type: "textarea", full: true },
  { name: "status", label: "Status", type: "select", options: TASK_STATUS },
  { name: "priority", label: "Priority", type: "select", options: PRIORITIES },
  { name: "area_id", label: "Area", type: "entity", lookup: "area" },
  { name: "program_id", label: "Program", type: "entity", lookup: "program" },
  { name: "project_id", label: "Project", type: "entity", lookup: "project" },
  { name: "assignee_id", label: "Assignee", type: "entity", lookup: "people" },
  { name: "responsible_id", label: "Responsible", type: "entity", lookup: "people" },
  { name: "scheduled_date", label: "Scheduled", type: "date" },
  { name: "due_date", label: "Due", type: "date" },
  { name: "estimated_minutes", label: "Estimate (min)", type: "number" },
  { name: "context", label: "Context", placeholder: "@home, @calls" },
  { name: "recurrence", label: "Recurrence", placeholder: "daily / weekly / monthly" },
  { name: "waiting_on", label: "Waiting on" },
  { name: "acceptance_required", label: "Requires acceptance", type: "checkbox" },
  { name: "notes", label: "Notes", type: "textarea", full: true },
]

const CONFIG: ListConfig = {
  searchKeys: ["title", "description", "context", "notes", "waiting_on"],
  filters: [
    { field: "status", label: "Status", options: TASK_STATUS },
    { field: "priority", label: "Priority", options: PRIORITIES },
  ],
  sorts: [
    { key: "default", label: "Priority", field: "" },
    { key: "due", label: "Due date", field: "due_date" },
    { key: "title", label: "A–Z", field: "title" },
    { key: "recent", label: "Recent", field: "updated_at", desc: true },
  ],
}

export function TaskRow({
  task,
  onEdit,
  selected,
}: {
  task: Task
  onEdit?: (t: Task) => void
  selected?: boolean
}) {
  const update = tasks.useUpdate()
  const done = task.status === "completed"
  return (
    <div
      className={cn(
        "flex items-center gap-3 border-b border-slate-50 px-4 py-2 last:border-0 hover:bg-slate-50/60",
        selected && "bg-indigo-50 hover:bg-indigo-50",
      )}
    >
      <button
        onClick={() =>
          update.mutate({
            id: task.id,
            body: { status: done ? "planned" : "completed" },
          })
        }
        className={cn(
          "flex h-5 w-5 shrink-0 items-center justify-center rounded border",
          done ? "border-emerald-500 bg-emerald-500 text-white" : "border-slate-300",
        )}
        title={done ? "Reopen" : "Complete"}
      >
        {done && <Check size={13} />}
      </button>
      <button
        className={cn("min-w-0 flex-1 text-left text-sm", done && "text-slate-400 line-through")}
        onClick={() => onEdit?.(task)}
      >
        <span className="truncate">{task.title}</span>
        {task.context && <span className="ml-2 text-xs text-slate-400">{task.context}</span>}
      </button>
      {task.project_id && (
        <span className="hidden text-xs text-slate-400 sm:inline">
          <RefName kind="project" id={task.project_id} />
        </span>
      )}
      {(task.status === "delegated" || task.status === "delivered") && (
        <span className="text-xs font-medium text-amber-600">delegated</span>
      )}
      <PriorityBadge priority={task.priority} />
      {task.due_date && <DateText value={task.due_date} overdue />}
    </div>
  )
}

export function TasksPage() {
  const navigate = useNavigate()
  const { id: selectedId } = useParams()
  const [queue, setQueue] = useState<"personal" | "delegated" | "all">("personal")
  const [includeClosed, setIncludeClosed] = useState(false)
  const [creating, setCreating] = useState(false)

  const { data, isLoading } = tasks.useList({
    queue,
    include_closed: String(includeClosed),
  })
  const create = tasks.useCreate()
  const rows = useMemo(() => data ?? [], [data])
  const { filtered, toolbarProps } = useListFilter(
    rows as unknown as Record<string, unknown>[],
    CONFIG,
  )
  const list = filtered as unknown as Task[]

  function submit(body: Body) {
    create.mutate(body)
    setCreating(false)
  }

  return (
    <div className="flex flex-col gap-4 lg:flex-row">
      {/* LEFT — task list */}
      <div className="space-y-3 lg:w-[26rem] lg:shrink-0">
        <div className="flex items-center justify-between">
          <h1 className="text-lg font-semibold text-slate-900">Tasks</h1>
          <Button onClick={() => setCreating(true)}>
            <Plus size={16} />
            New task
          </Button>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <div className="inline-flex rounded-lg border border-slate-200 p-0.5">
            {(["personal", "delegated", "all"] as const).map((q) => (
              <button
                key={q}
                onClick={() => setQueue(q)}
                className={cn(
                  "rounded-md px-3 py-1 text-sm capitalize",
                  queue === q ? "bg-indigo-600 text-white" : "text-slate-500 hover:text-slate-800",
                )}
              >
                {q}
              </button>
            ))}
          </div>
          <label className="flex items-center gap-1.5 text-sm text-slate-500">
            <input
              type="checkbox"
              checked={includeClosed}
              onChange={(e) => setIncludeClosed(e.target.checked)}
            />
            Include closed
          </label>
        </div>

        <ListToolbar {...toolbarProps} />

        {isLoading ? (
          <EmptyState>Loading…</EmptyState>
        ) : rows.length === 0 ? (
          <EmptyState>No tasks match.</EmptyState>
        ) : list.length === 0 ? (
          <EmptyState>No matches.</EmptyState>
        ) : (
          <Card className="max-h-[75vh] overflow-y-auto">
            {list.map((t) => (
              <TaskRow
                key={t.id}
                task={t}
                selected={t.id === selectedId}
                onEdit={(task) => navigate(task.id)}
              />
            ))}
          </Card>
        )}
      </div>

      {!selectedId && (
        <div className="hidden flex-1 lg:block">
          <EmptyState>Select a task to see its details.</EmptyState>
        </div>
      )}
      <Outlet />

      {creating && (
        <Modal title="New task" onClose={() => setCreating(false)}>
          <div className="max-h-[70vh] overflow-y-auto pr-1">
            <EntityForm fields={FIELDS} onSubmit={submit} onCancel={() => setCreating(false)} />
          </div>
        </Modal>
      )}
    </div>
  )
}
