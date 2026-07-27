import { Link } from "react-router-dom"
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
  { key: "my_inbox", title: "Needs your input", type: "request", label: (r) => String(r.subject ?? "") },
  { key: "open_requests", title: "Open requests", type: "request", label: (r) => String(r.subject ?? "") },
  { key: "request_followups", title: "Request follow-ups", type: "request", label: (r) => String(r.subject ?? "") },
  { key: "waiting_without_blocker", title: "Waiting, no blocker", type: "task", label: (r) => String(r.title ?? "") },
  { key: "delegated_without_owner", title: "Delegated, no owner", type: "task", label: (r) => String(r.title ?? "") },
  { key: "completed_with_open_tasks", title: "Done, but tasks open", type: "project", label: (r) => String(r.name ?? "") },
  { key: "conditions_without_protocol", title: "Conditions, no protocol", type: "program", label: (r) => String(r.name ?? "") },
  { key: "metrics_overdue", title: "Metrics due for a reading", type: "metric", label: (r) => String(r.name ?? ""), sub: (r) => (r.latest_entry ? `last ${formatDate(asDay(String(r.latest_entry)))}` : "never measured") },
  { key: "outcomes_overdue", title: "Targets past due", type: "outcome", label: (r) => String(r.name ?? "") },
  { key: "low_adherence", title: "Low med adherence", type: "routine", label: (r) => String(r.label ?? ""), sub: (r) => `${r.done ?? 0}/${r.expected ?? 0} days` },
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
          const body = (
            <>
              <div className={cn("text-lg font-semibold", n > 0 ? "text-amber-700" : "text-slate-300")}>
                {n}
              </div>
              <div className="text-xs text-slate-500">{c.title}</div>
            </>
          )
          // Only flagged tiles are actionable — they link to the full dashboard
          // where the individual items are clickable. Empty tiles stay inert.
          return n > 0 ? (
            <Link
              key={c.key}
              to="/reviews"
              className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 transition hover:border-amber-300 hover:bg-amber-100"
            >
              {body}
            </Link>
          ) : (
            <div
              key={c.key}
              className="rounded-lg border border-slate-100 bg-surface px-3 py-2"
            >
              {body}
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
    <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
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
                <li key={r.id} className="flex items-start justify-between gap-2">
                  <EntityRef
                    type={c.type}
                    id={String(r.id)}
                    className="min-w-0 flex-1 break-words text-slate-700"
                  >
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
