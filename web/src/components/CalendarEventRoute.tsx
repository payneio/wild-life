import { useState } from "react"
import { Navigate, useNavigate, useParams, useSearchParams } from "react-router-dom"
import { useQueryClient } from "@tanstack/react-query"
import { DetailDrawer } from "@/components/DetailDrawer"
import { RecurrenceScopeDialog } from "@/components/RecurrenceScopeDialog"
import { EmptyState, Modal } from "@/components/ui/primitives"
import { events } from "@/services/api/hooks"
import { REGISTRY } from "@/services/api/registry"
import { deleteOccurrence, type RecurrenceScope } from "@/services/calendar/recurrence"

/**
 * Deep-linkable event detail on the calendar: `/calendar/:id`. Unlike the generic
 * a record (which now always opens full-page), an event opens in a slide-over
 * drawer so the calendar grid stays put. Recurring deletes route through the
 * this/following/all scope dialog instead of DetailView's whole-series delete.
 * `?occ=<iso>` carries the clicked occurrence's start; cold deep-links (Today,
 * Coming-up, push) fall back to the series master start.
 */
export function CalendarEventRoute() {
  const { id } = useParams()
  const [sp] = useSearchParams()
  const occ = sp.get("occ")
  const navigate = useNavigate()
  const qc = useQueryClient()
  const def = REGISTRY.event
  const { data: event, isLoading, isError } = events.useGet(id)
  const remove = events.useRemove()
  const [deleting, setDeleting] = useState(false)

  // Return to wherever the event was opened from (a person/condition timeline,
  // the calendar grid, …) rather than always dumping onto /calendar. Cold
  // deep-links (idx 0 — push/permalink) fall back to the calendar.
  const close = () => {
    const idx = (window.history.state as { idx?: number } | null)?.idx ?? 0
    if (idx > 0) navigate(-1)
    else navigate("..", { relative: "path" })
  }
  const title = event ? def.title(event) : def.label

  const onDelete = () => {
    if (!event) return
    if (event.recurrence) {
      setDeleting(true)
      return
    }
    if (confirm("Delete this event?")) {
      remove.mutate(event.id)
      close()
    }
  }

  const applyDelete = async (scope: RecurrenceScope) => {
    if (!event) return
    await deleteOccurrence(event.id, scope, occ ?? event.start_at)
    qc.invalidateQueries()
    setDeleting(false)
    close()
  }

  const content = isLoading ? (
    <EmptyState>Loading…</EmptyState>
  ) : isError || !event ? (
    <EmptyState>Not found.</EmptyState>
  ) : (
    <def.detail entity={event} onClose={close} onDelete={onDelete} />
  )

  return (
    <>
      {/* Canvas pattern: the calendar is a spatial surface, so detail floats on top
          rather than displacing the grid. Desktop = centered modal; mobile collapses
          to a full-screen drawer (same as every other page on a phone). */}
      <div className="hidden lg:block">
        <Modal title={title} onClose={close}>
          {content}
        </Modal>
      </div>
      <div className="lg:hidden">
        <DetailDrawer title={title} onClose={close}>
          {content}
        </DetailDrawer>
      </div>

      {deleting && (
        <RecurrenceScopeDialog
          title="Delete recurring event"
          confirmLabel="Delete"
          danger
          onChoose={applyDelete}
          onCancel={() => setDeleting(false)}
        />
      )}
    </>
  )
}

/** Redirect retired `/events` and `/events/:id` deep links onto the calendar. */
export function EventsRedirect() {
  const { id } = useParams()
  return <Navigate to={id ? `/calendar/${id}` : "/calendar"} replace />
}
