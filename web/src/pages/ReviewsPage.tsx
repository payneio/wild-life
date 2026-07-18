import { useState } from "react"
import { useNavigate } from "react-router-dom"
import { Plus, RefreshCw } from "lucide-react"
import { EntityForm } from "@/components/EntityForm"
import { REVIEW_FIELDS } from "@/services/api/fields"
import { ReviewDashboardView } from "@/components/ReviewDashboard"
import { Badge, Button, Card, EmptyState, Modal } from "@/components/ui/primitives"
import { formatDate } from "@/lib/utils"
import { reviews, useReviewDashboard } from "@/services/api/hooks"
import type { Body } from "@/services/api/crud"

const FIELDS = REVIEW_FIELDS

export function ReviewsPage() {
  const navigate = useNavigate()
  const { data: dash, isLoading, refetch, isFetching } = useReviewDashboard()
  const { data: reviewList } = reviews.useList()
  const create = reviews.useCreate()
  const [creating, setCreating] = useState(false)

  function submit(body: Body) {
    create.mutate(body)
    setCreating(false)
  }

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
          <Button onClick={() => setCreating(true)}>
            <Plus size={16} />
            New review
          </Button>
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

      {creating && (
        <Modal title="New review" onClose={() => setCreating(false)}>
          <div className="max-h-[70vh] overflow-y-auto pr-1">
            <EntityForm
              fields={FIELDS}
              onSubmit={submit}
              onCancel={() => setCreating(false)}
            />
          </div>
        </Modal>
      )}
    </div>
  )
}
