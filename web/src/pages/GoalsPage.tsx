import { SimpleEntityPage, type Column } from "@/components/SimpleEntityPage"
import { RefName, StatusBadge } from "@/components/cells"
import { GOAL_FIELDS } from "@/services/api/fields"
import { goals, useGoalProgress } from "@/services/api/hooks"
import type { Goal } from "@/services/api/types"

/** Progress bar backed by the goal's computed-progress (metric/projects/manual). */
function GoalProgress({ goal }: { goal: Goal }) {
  const { data } = useGoalProgress(goal.id)
  const pct = data?.overall ?? goal.progress
  if (pct == null) return <span className="text-slate-300">—</span>
  const met = data?.metric_met === true || pct >= 100
  return (
    <div className="flex items-center gap-2">
      <div className="h-1.5 w-20 overflow-hidden rounded-full bg-slate-100">
        <div
          className={met ? "h-full bg-emerald-500" : "h-full bg-indigo-500"}
          style={{ width: `${Math.min(100, Math.max(0, pct))}%` }}
        />
      </div>
      <span className="tabular-nums text-slate-600">{Math.round(pct)}%</span>
    </div>
  )
}

export function GoalsPage() {
  const columns: Column<Goal>[] = [
    { key: "name", label: "Goal", render: (r) => <span className="font-medium">{r.name}</span> },
    { key: "status", label: "Status", render: (r) => <StatusBadge status={r.status} /> },
    { key: "area_id", label: "Area", render: (r) => <RefName kind="area" id={r.area_id} /> },
    { key: "progress", label: "Progress", render: (r) => <GoalProgress goal={r} /> },
  ]
  return (
    <SimpleEntityPage
      title="Goals"
      subtitle="Desired results that give direction"
      crud={goals}
      fields={GOAL_FIELDS}
      columns={columns}
      detail="page"
    />
  )
}
