import { useNavigate } from "react-router-dom"
import { Plus, RefreshCw } from "lucide-react"
import { ReviewDashboardView } from "@/components/ReviewDashboard"
import { Badge, Button, Card, EmptyState } from "@/components/ui/primitives"
import { formatDate } from "@/lib/utils"
import { reviews, useReviewDashboard } from "@/services/api/hooks"
import { addDays, today, type CalendarDay } from "@/lib/date"
import type { Review } from "@/services/api/types"

/** The recurring reviews. The entity-scoped types (area, project, …) are made
 *  from that entity, not from this list. */
const PERIODIC = ["daily", "weekly", "monthly", "quarterly"] as const

/** The period a review of this kind covers, ending today. */
function periodFor(kind: (typeof PERIODIC)[number]): { start: CalendarDay; end: CalendarDay } {
  const end = today()
  const back = { daily: 0, weekly: 6, monthly: 29, quarterly: 89 }[kind]
  return { start: addDays(end, -back), end }
}

export function ReviewsPage() {
  const navigate = useNavigate()
  const { data: dash, isLoading, refetch, isFetching } = useReviewDashboard()
  const { data: reviewList } = reviews.useList()
  const create = reviews.useCreate()


  return (
    <div className="space-y-6">
      <div>
        <div className="mb-3 flex items-center justify-between">
          <div>
            <h1 className="text-lg font-semibold text-slate-900">Review</h1>
            <p className="text-sm text-slate-500">What needs attention — drift, neglect, and blockers</p>
          </div>
          <Button variant="secondary" onClick={() => refetch()}>
            <RefreshCw size={15} className={isFetching ? "animate-spin" : ""} />
            Refresh
          </Button>
        </div>
        {isLoading || !dash ? <EmptyState>Loading…</EmptyState> : <ReviewDashboardView data={dash} />}
      </div>

      <div>
        <div className="mb-3 flex items-center justify-between">
          <h2 className="text-base font-semibold text-slate-900">Review records</h2>
          {/* A review is a ritual, not a named thing: `review_type` is required
              and there's no title to type. So the *choice* is the create
              affordance, and the period follows from it instead of being typed
              by hand — which is how periods stop being wrong. */}
          <div className="flex flex-wrap gap-1.5">
            {PERIODIC.map((kind) => (
              <Button
                key={kind}
                variant="secondary"
                onClick={() => {
                  const { start, end } = periodFor(kind)
                  create.mutate(
                    { review_type: kind, period_start: start, period_end: end },
                    { onSuccess: (r: Review) => navigate(`/reviews/${r.id}`) },
                  )
                }}
              >
                <Plus size={14} />
                <span className="capitalize">{kind}</span>
              </Button>
            ))}
          </div>
        </div>
        {(reviewList ?? []).length === 0 ? (
          <EmptyState>No reviews recorded yet.</EmptyState>
        ) : (
          <div className="space-y-2">
            {(reviewList ?? []).map((r) => (
              <Card key={r.id} className="p-3">
                <button className="w-full text-left" onClick={() => navigate(`/reviews/${r.id}`)}>
                  <div className="flex items-center gap-2">
                    <Badge className="capitalize">{r.review_type}</Badge>
                    <span className="text-xs text-slate-400">
                      {r.period_start ? formatDate(r.period_start) : formatDate(r.created_at)}
                    </span>
                  </div>
                  {r.observations && <p className="mt-1 line-clamp-2 text-sm text-slate-600">{r.observations}</p>}
                </button>
              </Card>
            ))}
          </div>
        )}
      </div>

    </div>
  )
}
