import { useState } from "react"
import { Navigate, useNavigate, useParams, useSearchParams } from "react-router-dom"
import { useQueryClient } from "@tanstack/react-query"
import { DetailDrawer } from "@/components/DetailDrawer"
import { RecurrenceScopeDialog } from "@/components/RecurrenceScopeDialog"
import { EmptyState, Modal } from "@/components/ui/primitives"
import { moments, useDeleteOccurrence } from "@/services/api/hooks"
import { REGISTRY } from "@/services/api/registry"
import { KIND_LABEL } from "@/lib/moments"
import { asInstant } from "@/lib/date"
import type { RecurrenceScope } from "@/services/api/types"

/**
 * Deep-linkable occurrence detail on the calendar: `/calendar/:id`, where `:id`
 * is a **moment**. Unlike a generic record (which always opens full-page), it
 * opens in a slide-over so the calendar grid stays put.
 *
 * Only a stored occurrence reaches here. A projection has no row to address, and
 * creating one just because someone clicked it is what "computed, never
 * materialised" forbids — so the grid sends those to the series instead.
 *
 * `?occ=<iso>` carries the slot that was clicked, which is what a scoped delete
 * names: an exception belonging to a series is withdrawn at its slot, not
 * deleted as a row.
 */
export function CalendarEventRoute() {
  const { id } = useParams()
  const [sp] = useSearchParams()
  // A query param is a bare string until something proves otherwise; `asInstant`
  // parses it and answers null when the URL was edited or truncated.
  const occ = asInstant(sp.get("occ"))
  const navigate = useNavigate()
  const qc = useQueryClient()
  const def = REGISTRY.moment
  const { data: event, isLoading, isError } = moments.useGet(id)
  const remove = moments.useRemove()
  const removeOcc = useDeleteOccurrence()
  const [deleting, setDeleting] = useState(false)

  // Return to wherever the event was opened from (a person/condition timeline,
  // the calendar grid, …) rather than always dumping onto /calendar. Cold
  // deep-links (idx 0 — push/permalink) fall back to the calendar.
  const close = () => {
    const idx = (window.history.state as { idx?: number } | null)?.idx ?? 0
    if (idx > 0) navigate(-1)
    else navigate("..", { relative: "path" })
  }
  // The drawer header names the *kind* of thing, not the thing: the title is
  // the first editable field inside, and printing it twice in a 380px drawer
  // spends the most valuable line on a repeat.
  const title = event ? KIND_LABEL[event.kind] : def.label

  const onDelete = () => {
    if (!event) return
    // Part of a series: ask how far the deletion reaches before doing anything.
    if (event.rule_id) {
      setDeleting(true)
      return
    }
    if (confirm("Delete this?")) {
      remove.mutate(event.id)
      close()
    }
  }

  const applyDelete = async (scope: RecurrenceScope) => {
    if (!event) return
    await removeOcc.mutateAsync({
      scope,
      rule_id: event.rule_id,
      moment_id: event.id,
      occurrence_at: occ ?? event.occurrence_at ?? event.started_at,
    })
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
          title="Delete recurring occurrence"
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
