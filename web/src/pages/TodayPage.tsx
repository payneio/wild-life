import { CheckCircle2 } from "lucide-react"
import { Link } from "react-router-dom"
import { ReviewDashboardView } from "@/components/ReviewDashboard"
import { TaskRow } from "@/pages/TasksPage"
import { Card, EmptyState } from "@/components/ui/primitives"
import { isToday, PRIORITY_RANK, todayISO } from "@/lib/format"
import { formatDateTime } from "@/lib/utils"
import {
  events,
  routines,
  tasks,
  useCompleteRoutine,
  useReviewDashboard,
} from "@/services/api/hooks"

function SectionTitle({ children, to }: { children: string; to?: string }) {
  return (
    <div className="mb-2 flex items-center justify-between">
      <h2 className="text-sm font-semibold text-slate-700">{children}</h2>
      {to && (
        <Link to={to} className="text-xs text-indigo-600 hover:underline">
          view all
        </Link>
      )}
    </div>
  )
}

export function TodayPage() {
  const today = todayISO()
  const { data: taskData } = tasks.useList({ queue: "personal", include_closed: "false" })
  const { data: routineData } = routines.useList({ status: "active" })
  const { data: eventData } = events.useList()
  const { data: dash } = useReviewDashboard()
  const complete = useCompleteRoutine()

  const todays = (taskData ?? [])
    .filter((t) => (t.scheduled_date && t.scheduled_date <= today) || (t.due_date && t.due_date <= today))
    .sort((a, b) => PRIORITY_RANK[a.priority] - PRIORITY_RANK[b.priority])
  const activeRoutines = (routineData ?? []).filter((r) => r.status === "active")
  const todaysEvents = (eventData ?? []).filter((e) => isToday(e.start_at))

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-xl font-semibold text-slate-900">Today</h1>
        <p className="text-sm text-slate-500">
          {new Date().toLocaleDateString(undefined, {
            weekday: "long",
            month: "long",
            day: "numeric",
          })}
        </p>
      </div>

      <div className="grid gap-6 lg:grid-cols-3">
        <div className="space-y-6 lg:col-span-2">
          <section>
            <SectionTitle to="/tasks">Today's tasks</SectionTitle>
            {todays.length === 0 ? (
              <EmptyState>Nothing scheduled or due. Clear runway.</EmptyState>
            ) : (
              <Card>
                {todays.map((t) => (
                  <TaskRow key={t.id} task={t} />
                ))}
              </Card>
            )}
          </section>

          <section>
            <SectionTitle to="/routines">Routines</SectionTitle>
            {activeRoutines.length === 0 ? (
              <EmptyState>No active routines.</EmptyState>
            ) : (
              <Card className="divide-y divide-slate-50">
                {activeRoutines.map((r) => (
                  <div key={r.id} className="flex items-center justify-between px-4 py-2">
                    <div className="text-sm">
                      <span className="font-medium">{r.name}</span>
                      {r.frequency && <span className="ml-2 text-xs text-slate-400">{r.frequency}</span>}
                    </div>
                    <button
                      className="flex items-center gap-1 text-sm text-emerald-600 hover:text-emerald-700"
                      onClick={() => complete.mutate({ id: r.id })}
                    >
                      <CheckCircle2 size={16} />
                      Log
                    </button>
                  </div>
                ))}
              </Card>
            )}
          </section>

          {todaysEvents.length > 0 && (
            <section>
              <SectionTitle to="/events">Today's events</SectionTitle>
              <Card className="divide-y divide-slate-50">
                {todaysEvents.map((e) => (
                  <div key={e.id} className="flex items-center justify-between px-4 py-2 text-sm">
                    <span className="font-medium">{e.title}</span>
                    <span className="text-xs text-slate-400">{formatDateTime(e.start_at)}</span>
                  </div>
                ))}
              </Card>
            </section>
          )}
        </div>

        <div>
          <SectionTitle to="/reviews">Needs attention</SectionTitle>
          {dash ? (
            <ReviewDashboardView data={dash} compact />
          ) : (
            <EmptyState>Loading…</EmptyState>
          )}
        </div>
      </div>
    </div>
  )
}
