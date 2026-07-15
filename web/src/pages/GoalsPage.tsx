import { useState } from "react"
import { PanelRight, X } from "lucide-react"
import { SimpleEntityPage, type Column } from "@/components/SimpleEntityPage"
import { RefName, StatusBadge } from "@/components/cells"
import { Button, EmptyState, Modal, Select } from "@/components/ui/primitives"
import type { FieldSpec } from "@/components/EntityForm"
import {
  goals,
  projects,
  useGoalProgress,
  useGoalProjects,
  useLinkGoalProject,
  useUnlinkGoalProject,
} from "@/services/api/hooks"
import type { Goal } from "@/services/api/types"

const FIELDS: FieldSpec[] = [
  { name: "name", label: "Name", full: true },
  { name: "status", label: "Status", type: "select", options: ["active", "achieved", "paused", "dropped"] },
  { name: "area_id", label: "Area", type: "entity", lookup: "area" },
  { name: "metric_id", label: "Metric", type: "entity", lookup: "metric" },
  { name: "target_state", label: "Target state" },
  { name: "target_value", label: "Target value", type: "number" },
  { name: "baseline", label: "Baseline", type: "number" },
  { name: "progress", label: "Progress %", type: "number" },
  { name: "target_date", label: "Target date", type: "date" },
  { name: "measurement_method", label: "Measurement", full: true },
  { name: "description", label: "Description", type: "textarea", full: true },
  { name: "notes", label: "Notes", type: "textarea", full: true },
]

function ProgressBar({ pct }: { pct: number }) {
  return (
    <div className="h-2 w-full overflow-hidden rounded-full bg-slate-100">
      <div className="h-full bg-indigo-500" style={{ width: `${Math.min(100, Math.max(0, pct))}%` }} />
    </div>
  )
}

function GoalDetail({ goal, onClose }: { goal: Goal; onClose: () => void }) {
  const linked = useGoalProjects(goal.id).data ?? []
  const progress = useGoalProgress(goal.id).data
  const allProjects = projects.useList().data ?? []
  const link = useLinkGoalProject()
  const unlink = useUnlinkGoalProject()
  const [pick, setPick] = useState("")
  const linkedIds = new Set(linked.map((p) => p.id))
  const pct = goal.progress ?? progress?.from_projects ?? 0
  return (
    <Modal title={goal.name} onClose={onClose}>
      <div className="space-y-4">
        <div>
          <div className="mb-1 flex justify-between text-sm">
            <span className="text-slate-500">Progress</span>
            <span className="font-medium">{Math.round(pct)}%</span>
          </div>
          <ProgressBar pct={pct} />
          {progress && (
            <p className="mt-1 text-xs text-slate-400">
              {progress.completed_projects}/{progress.linked_projects} linked projects complete
              {progress.latest_metric_value != null && ` · latest metric ${progress.latest_metric_value}`}
            </p>
          )}
        </div>
        <div>
          <h3 className="mb-1 text-xs font-semibold uppercase tracking-wide text-slate-400">
            Linked projects
          </h3>
          {linked.length === 0 ? (
            <EmptyState>No projects linked.</EmptyState>
          ) : (
            <ul className="space-y-1 text-sm">
              {linked.map((p) => (
                <li key={p.id} className="flex items-center justify-between rounded border border-slate-100 px-2 py-1">
                  <span>{p.name}</span>
                  <button
                    className="text-slate-400 hover:text-red-600"
                    onClick={() => unlink.mutate({ goalId: goal.id, projectId: p.id })}
                  >
                    <X size={14} />
                  </button>
                </li>
              ))}
            </ul>
          )}
          <div className="mt-2 flex gap-2">
            <Select value={pick} onChange={(e) => setPick(e.target.value)}>
              <option value="">Link a project…</option>
              {allProjects
                .filter((p) => !linkedIds.has(p.id))
                .map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.name}
                  </option>
                ))}
            </Select>
            <Button
              variant="secondary"
              disabled={!pick}
              onClick={() => {
                if (pick) link.mutate({ goalId: goal.id, projectId: pick })
                setPick("")
              }}
            >
              Link
            </Button>
          </div>
        </div>
      </div>
    </Modal>
  )
}

export function GoalsPage() {
  const [selected, setSelected] = useState<Goal | null>(null)
  const columns: Column<Goal>[] = [
    { key: "name", label: "Goal", render: (r) => <span className="font-medium">{r.name}</span> },
    { key: "status", label: "Status", render: (r) => <StatusBadge status={r.status} /> },
    { key: "area_id", label: "Area", render: (r) => <RefName kind="area" id={r.area_id} /> },
    { key: "progress", label: "Progress", render: (r) => (r.progress != null ? `${Math.round(r.progress)}%` : "—") },
  ]
  return (
    <>
      <SimpleEntityPage
        title="Goals"
        subtitle="Desired results that give direction"
        crud={goals}
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
      {selected && <GoalDetail goal={selected} onClose={() => setSelected(null)} />}
    </>
  )
}
