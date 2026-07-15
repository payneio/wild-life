import { useState } from "react"
import { PanelRight } from "lucide-react"
import { SimpleEntityPage, type Column } from "@/components/SimpleEntityPage"
import { DateText, PriorityBadge, RefName, StatusBadge } from "@/components/cells"
import { Button, EmptyState, Input, Modal } from "@/components/ui/primitives"
import { TaskRow } from "@/pages/TasksPage"
import type { FieldSpec } from "@/components/EntityForm"
import { projects, tasks } from "@/services/api/hooks"
import type { Project } from "@/services/api/types"

const PROJECT_STATUS = ["proposed", "active", "waiting", "paused", "completed", "cancelled"] as const

const FIELDS: FieldSpec[] = [
  { name: "name", label: "Name", full: true },
  { name: "status", label: "Status", type: "select", options: PROJECT_STATUS },
  { name: "priority", label: "Priority", type: "select", options: ["low", "medium", "high", "urgent"] },
  { name: "area_id", label: "Area", type: "entity", lookup: "area" },
  { name: "program_id", label: "Program", type: "entity", lookup: "program" },
  { name: "intended_outcome", label: "Intended outcome", type: "textarea", full: true },
  { name: "completion_criteria", label: "Completion criteria", type: "textarea", full: true },
  { name: "next_action", label: "Next action", full: true },
  { name: "start_date", label: "Start", type: "date" },
  { name: "target_date", label: "Target", type: "date" },
  { name: "last_activity_date", label: "Last activity", type: "date" },
  { name: "accountable_owner_id", label: "Accountable", type: "entity", lookup: "people" },
  { name: "responsible_lead_id", label: "Lead", type: "entity", lookup: "people" },
  { name: "notes", label: "Notes", type: "textarea", full: true },
]

function ProjectDetail({ project, onClose }: { project: Project; onClose: () => void }) {
  const { data } = tasks.useList({ project_id: project.id, include_closed: "true" })
  const update = projects.useUpdate()
  const createTask = tasks.useCreate()
  const [next, setNext] = useState(project.next_action ?? "")
  const [newTask, setNewTask] = useState("")
  const list = data ?? []
  return (
    <Modal title={project.name} onClose={onClose}>
      <div className="space-y-4">
        <div>
          <label className="text-xs font-semibold uppercase tracking-wide text-slate-400">
            Next action
          </label>
          <div className="mt-1 flex gap-2">
            <Input value={next} onChange={(e) => setNext(e.target.value)} placeholder="What's the very next step?" />
            <Button
              variant="secondary"
              onClick={() => update.mutate({ id: project.id, body: { next_action: next || null } })}
            >
              Save
            </Button>
          </div>
        </div>
        <div>
          <h3 className="mb-1 text-xs font-semibold uppercase tracking-wide text-slate-400">
            Tasks ({list.length})
          </h3>
          <div className="rounded-lg border border-slate-100">
            {list.length === 0 ? (
              <EmptyState>No tasks yet.</EmptyState>
            ) : (
              list.map((t) => <TaskRow key={t.id} task={t} />)
            )}
          </div>
          <div className="mt-2 flex gap-2">
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
        </div>
      </div>
    </Modal>
  )
}

export function ProjectsPage() {
  const [selected, setSelected] = useState<Project | null>(null)
  const columns: Column<Project>[] = [
    { key: "name", label: "Project", render: (r) => <span className="font-medium">{r.name}</span> },
    { key: "status", label: "Status", render: (r) => <StatusBadge status={r.status} /> },
    { key: "priority", label: "Priority", render: (r) => <PriorityBadge priority={r.priority} /> },
    { key: "area_id", label: "Area", render: (r) => <RefName kind="area" id={r.area_id} /> },
    { key: "next_action", label: "Next action", render: (r) => r.next_action || <span className="text-amber-600">— set one</span> },
    { key: "target_date", label: "Target", render: (r) => <DateText value={r.target_date} /> },
  ]
  return (
    <>
      <SimpleEntityPage
        title="Projects"
        subtitle="Finite efforts with a defined outcome"
        crud={projects}
        fields={FIELDS}
        columns={columns}
        rowActions={(row) => (
          <button
            className="ml-1 rounded p-1 text-slate-400 hover:bg-slate-100 hover:text-slate-700"
            title="Open"
            onClick={() => setSelected(row)}
          >
            <PanelRight size={15} />
          </button>
        )}
      />
      {selected && <ProjectDetail project={selected} onClose={() => setSelected(null)} />}
    </>
  )
}
