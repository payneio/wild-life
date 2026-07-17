import { asDay } from "@/lib/date"
import { Card } from "@/components/ui/primitives"
import { EntityRef } from "@/components/graph/EntityRef"
import { cn } from "@/lib/utils"
import { formatDate } from "@/lib/utils"
import type { DashRow, EntityType, ReviewDashboard } from "@/services/api/types"

interface Cat {
  key: keyof ReviewDashboard
  title: string
  type: EntityType
  label: (r: DashRow) => string
  sub?: (r: DashRow) => string
}

const CATS: Cat[] = [
  { key: "overdue_tasks", title: "Overdue tasks", type: "task", label: (r) => String(r.title ?? ""), sub: (r) => (r.due_date ? `due ${formatDate(asDay(String(r.due_date)))}` : "") },
  { key: "due_today", title: "Due today", type: "task", label: (r) => String(r.title ?? "") },
  { key: "stale_projects", title: "Stale projects", type: "project", label: (r) => String(r.name ?? "") },
  { key: "projects_missing_next_action", title: "Missing next action", type: "project", label: (r) => String(r.name ?? "") },
  { key: "unclear_ownership", title: "Unclear ownership", type: "project", label: (r) => String(r.name ?? "") },
  { key: "inactive_programs", title: "Inactive programs", type: "program", label: (r) => String(r.name ?? "") },
  { key: "neglected_areas", title: "Neglected areas", type: "area", label: (r) => String(r.name ?? "") },
  { key: "overdue_delegations", title: "Overdue delegations", type: "delegation", label: (r) => String(r.requested_outcome ?? "") },
  { key: "delegation_followups", title: "Delegation follow-ups", type: "delegation", label: (r) => String(r.requested_outcome ?? "") },
  { key: "unreviewed_deliverables", title: "Deliverables to review", type: "delegation", label: (r) => String(r.requested_outcome ?? "") },
  { key: "waiting_followups", title: "Waiting follow-ups", type: "waiting_item", label: (r) => String(r.expected_result ?? "") },
]

export function ReviewDashboardView({
  data,
  compact,
}: {
  data: ReviewDashboard
  compact?: boolean
}) {
  if (compact) {
    return (
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
        {CATS.map((c) => {
          const n = (data[c.key] as DashRow[]).length
          return (
            <div
              key={c.key}
              className={cn(
                "rounded-lg border px-3 py-2",
                n > 0 ? "border-amber-200 bg-amber-50" : "border-slate-100 bg-surface",
              )}
            >
              <div className={cn("text-lg font-semibold", n > 0 ? "text-amber-700" : "text-slate-300")}>
                {n}
              </div>
              <div className="text-xs text-slate-500">{c.title}</div>
            </div>
          )
        })}
      </div>
    )
  }
  const active = CATS.filter((c) => (data[c.key] as DashRow[]).length > 0)
  if (active.length === 0) {
    return (
      <Card className="p-6 text-center text-sm text-emerald-600">
        Nothing flagged — everything looks current. 🎉
      </Card>
    )
  }
  return (
    <div className="grid gap-3 sm:grid-cols-2">
      {active.map((c) => {
        const rows = data[c.key] as DashRow[]
        return (
          <Card key={c.key} className="p-3">
            <div className="mb-2 flex items-center gap-2">
              <span className="text-sm font-semibold text-slate-800">{c.title}</span>
              <span className="rounded-full bg-amber-100 px-2 text-xs font-medium text-amber-700">
                {rows.length}
              </span>
            </div>
            <ul className="space-y-1 text-sm">
              {rows.map((r) => (
                <li key={r.id} className="flex justify-between gap-2">
                  <EntityRef type={c.type} id={String(r.id)} className="truncate text-slate-700">
                    {c.label(r)}
                  </EntityRef>
                  {c.sub && <span className="shrink-0 text-xs text-slate-400">{c.sub(r)}</span>}
                </li>
              ))}
            </ul>
          </Card>
        )
      })}
    </div>
  )
}
