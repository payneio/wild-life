import { Link } from "react-router-dom"
import { MomentComposer } from "@/components/MomentComposer"
import { ReviewDashboardView } from "@/components/ReviewDashboard"
import { TodayRhythms } from "@/components/TodayRhythms"
import { ComingUp } from "@/components/ComingUp"
import { TaskRow } from "@/pages/TasksPage"
import { Card, EmptyState } from "@/components/ui/primitives"
import { PRIORITY_RANK, todayISO } from "@/lib/format"
import { formatDateTime } from "@/lib/utils"
import {
  tasks,
  useCreateMomentWithImages,
  useOccurrences,
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
  // Through the same expansion the calendar draws: a recurring meeting today is
  // computed, not stored, so listing rows would report an empty day.
  const { data: todaysEvents } = useOccurrences({
    start: `${today}T00:00:00.000Z`,
    end: `${today}T23:59:59.999Z`,
  })
  const { data: dash } = useReviewDashboard()
  const submitReflection = useCreateMomentWithImages()

  const todays = (taskData ?? [])
    .filter((t) => (t.scheduled_date && t.scheduled_date <= today) || (t.due_date && t.due_date <= today))
    .sort((a, b) => PRIORITY_RANK[a.priority] - PRIORITY_RANK[b.priority])


  return (
    <div className="space-y-6">
      <header className="border-b border-slate-200 pb-4">
        <p className="text-[11px] font-medium uppercase tracking-[0.18em] text-slate-400">
          {new Date().toLocaleDateString(undefined, {
            weekday: "long",
            month: "long",
            day: "numeric",
          })}
        </p>
        <h1 className="mt-1 text-3xl font-medium text-slate-900">Today</h1>
      </header>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
        <div className="min-w-0 space-y-6 lg:col-span-2">
          <section>
            <SectionTitle to="/notes">Journal</SectionTitle>
            <Card className="p-3">
              {/* The Journal's own act, written here: a reflection, not a
                  capture — you are on the Journal card and have said so by
                  being here. Quick capture (⌘⇧N) is the surface that can't
                  know, and its unresolved kind is the inbox. */}
              <MomentComposer
                mode="create"
                kind="reflection"
                compact
                placeholder="Jot an entry for today…"
                onSubmit={(b, pending) => submitReflection(b, pending)}
              />
            </Card>
          </section>

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

          <TodayRhythms />

          {(todaysEvents ?? []).length > 0 && (
            <section>
              <SectionTitle to="/calendar">Today's events</SectionTitle>
              <Card className="divide-y divide-slate-50">
                {(todaysEvents ?? []).map((e) => (
                  <Link
                    key={`${e.moment_id ?? e.rule_id}:${e.occurrence_at}`}
                    to={e.moment_id ? `/calendar/${e.moment_id}` : `/routines/${e.rule_id}`}
                    className="flex items-center justify-between px-4 py-2 text-sm transition hover:bg-slate-50"
                  >
                    <span className="font-medium">{e.title ?? "Untitled"}</span>
                    <span className="text-xs text-slate-400">{formatDateTime(e.start_at)}</span>
                  </Link>
                ))}
              </Card>
            </section>
          )}
        </div>

        <div className="min-w-0 space-y-5">
          <div>
            <SectionTitle to="/reviews">Needs attention</SectionTitle>
            {dash ? (
              <ReviewDashboardView data={dash} compact />
            ) : (
              <EmptyState>Loading…</EmptyState>
            )}
          </div>
          <ComingUp />
        </div>
      </div>
    </div>
  )
}
