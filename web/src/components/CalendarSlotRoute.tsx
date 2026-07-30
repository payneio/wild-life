import { useNavigate, useParams, useSearchParams } from "react-router-dom"
import { useQueryClient } from "@tanstack/react-query"
import { DetailDrawer } from "@/components/DetailDrawer"
import { MomentComposer } from "@/components/MomentComposer"
import { Series } from "@/components/calendar/Series"
import { EmptyState, Modal } from "@/components/ui/primitives"
import {
  useCreateMomentWithImages,
  useEditOccurrence,
  useOccurrences,
} from "@/services/api/hooks"
import type { Body } from "@/services/api/crud"
import { asInstant, compareInstants, dayOf, endOfDay, startOfDay } from "@/lib/date"
import type { PendingImage } from "@/services/api/momentImages"

/**
 * A slot in a series that nothing has happened to yet — `/calendar/slot/:ruleId?occ=…`.
 *
 * A recurring meeting is projected, never stored, so it has no id to address and
 * `/calendar/:id` cannot open it. The grid used to send those clicks to the
 * *series* instead, which is why a Thursday meeting's notes ended up filed on
 * the rule that generates every Thursday — one object that cannot say which
 * week you meant. You did not choose that; the routing did.
 *
 * So the slot gets a surface of its own, addressed the way the model already
 * names it: `(rule, occurrence_at)`. What it deliberately does **not** do is
 * create a row for being looked at — "computed, never materialised" forbids
 * exactly that, and a row per meeting you glanced at would make every glance an
 * exception immune to a later edit of the series.
 *
 * Writing is different. A note about this Thursday *is* something happening to
 * this Thursday, which is the definition of a slot that earns a row. So the
 * first note materialises the occurrence (`PATCH /occurrences` scope `this`,
 * which is idempotent on the pair), roots itself at the moment that comes back,
 * and hands you over to the real record — from then on it is an ordinary
 * occasion with an ordinary Log.
 */
export function CalendarSlotRoute() {
  const { ruleId } = useParams()
  const [sp] = useSearchParams()
  const occ = asInstant(sp.get("occ"))
  const navigate = useNavigate()
  const qc = useQueryClient()
  const materialise = useEditOccurrence()
  const write = useCreateMomentWithImages()

  const close = () => {
    const idx = (window.history.state as { idx?: number } | null)?.idx ?? 0
    if (idx > 0) navigate(-1)
    else navigate("/calendar")
  }

  // The projection is re-read rather than passed through router state, so a
  // permalink to a slot opens the same as a click on one.
  const day = occ ? dayOf(occ) : null
  const { data, isLoading } = useOccurrences(
    day ? { start: startOfDay(day), end: endOfDay(day) } : {},
    !!day,
  )
  // `compareInstants`, not `===`. The API answers `2026-07-30T08:30:00-07:00`
  // and `asInstant` normalises the URL's copy to `…T15:30:00Z` — the same
  // instant, and two different strings. Text equality here silently found
  // nothing and rendered "no longer on the calendar" over a meeting that was
  // plainly on the grid behind it.
  const slot = (data ?? []).find(
    (o) =>
      o.rule_id === ruleId &&
      !!o.occurrence_at &&
      !!occ &&
      compareInstants(o.occurrence_at, occ) === 0,
  )

  const submit = async (body: Body, pending: PendingImage[]) => {
    if (!ruleId || !occ) return
    // Give the slot a row, then root the note at it. Idempotent on the pair, so
    // a double-submit corrects one occurrence rather than growing a second.
    const occurrence = await materialise.mutateAsync({
      scope: "this",
      rule_id: ruleId,
      occurrence_at: occ,
      changes: {},
    })
    const momentId = occurrence.moment_id
    if (!momentId) return
    await write(
      {
        ...body,
        links: [
          ...((body.links as unknown[]) ?? []),
          { role: "subject", entity_type: "moment", entity_id: momentId },
        ],
      },
      pending,
    )
    void qc.invalidateQueries()
    navigate(`/calendar/${momentId}?occ=${encodeURIComponent(occ)}`, { replace: true })
  }

  const content =
    isLoading && !slot ? (
      <EmptyState>Loading…</EmptyState>
    ) : !slot ? (
      <EmptyState>That occurrence is no longer on the calendar.</EmptyState>
    ) : (
      <div className="space-y-3">
        <div>
          <h2 className="text-lg font-semibold text-slate-900">
            {slot.title ?? "(untitled)"}
          </h2>
          <p className="mt-0.5 text-sm text-slate-600">
            {when(slot.start_at, slot.end_at ?? null, slot.all_day)}
          </p>
        </div>
        {/* Say what generates this, and go there. A slot exists *only* because a
            rule says so, so of every surface in the app this is the one that
            may not leave the rule unreachable — and sending the click here
            instead of to the series is precisely what would have. */}
        {ruleId && <Series ruleId={ruleId} />}
        {/* No fields: nothing here is editable until the slot is a row, and
            editing one is what the scoped-edit dialog on the grid is for. The
            one act that belongs to *this* Thursday rather than to the series is
            writing about it. */}
        <MomentComposer
          mode="create"
          kind="observation"
          autoFocus
          onSubmit={submit}
          createLabel="Post"
          placeholder="What's on your mind?"
        />
        <p className="text-[11px] text-slate-400">
          Writing here files the note on this occurrence, not on every one.
        </p>
      </div>
    )

  const title = "Occasion"
  return (
    <>
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
    </>
  )
}

function when(start: string, end: string | null, allDay: boolean): string {
  const from = new Date(start)
  const day = from.toLocaleDateString(undefined, {
    weekday: "long",
    day: "numeric",
    month: "long",
  })
  if (allDay) return day
  const clock = (d: Date) =>
    d.toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" })
  return `${day} · ${clock(from)}${end ? `–${clock(new Date(end))}` : ""}`
}
