// The moment vocabulary, on the frontend side.
//
// `MomentKind` names **the act a moment is** — never its subject, never its
// target type, never its tense (see `api/docs/moments.md`). Every kind is
// written by the surface that creates the moment; no surface asks the user. So
// what lives here is what the *reader* needs: how to say a kind out loud, which
// kinds carry prose you wrote, and where a moment sits in time.

import { asDay, dayLabel, type Instant } from "@/lib/date"
import type { EntityType, Moment, MomentKind, MomentLink, MomentRole } from "@/services/api/types"

/**
 * The kinds whose content *is* writing — the ones a composer can create and an
 * editor can change.
 *
 * This is the line the Log draws between editable and read-only, and it is a
 * property of the act rather than of the row's provenance. A `dose` or an
 * `occasion` is a fact recorded by another surface (the dose logger, the
 * calendar) and still mirrored from it by `POST /moments/sync`; editing the
 * mirror would be overwritten the next time the tick read its source. Prose has
 * no other surface — the composer *is* where it lives — so it is always safe to
 * edit, including the 848 entries the backfill carried over from `notes`.
 */
export const PROSE_KINDS = ["capture", "reflection", "observation"] as const

export function isProse(kind: MomentKind): boolean {
  return (PROSE_KINDS as readonly string[]).includes(kind)
}

/** The act, in words. Present tense where the act has one, because a timeline
 *  reads as a list of things done rather than a list of record types. */
export const KIND_LABEL: Record<MomentKind, string> = {
  capture: "Capture",
  reflection: "Reflection",
  observation: "Note",
  occasion: "Occasion",
  exchange: "Exchange",
  visit: "Visit",
  measurement: "Measurement",
  dose: "Dose",
  activity: "Activity",
  work: "Work",
  completion: "Completed",
  withdrawal: "Withdrawn",
  decision: "Decision",
}

/** Badge colouring, grouped by what the act is about rather than per kind —
 *  thirteen distinct colours would be a legend nobody can hold. */
export const KIND_CLASS: Record<MomentKind, string> = {
  capture: "bg-amber-100 text-amber-700",
  reflection: "bg-slate-100 text-slate-600",
  observation: "bg-slate-100 text-slate-600",
  occasion: "bg-indigo-100 text-indigo-700",
  exchange: "bg-indigo-100 text-indigo-700",
  visit: "bg-sky-100 text-sky-700",
  measurement: "bg-teal-100 text-teal-700",
  dose: "bg-teal-100 text-teal-700",
  activity: "bg-teal-100 text-teal-700",
  work: "bg-violet-100 text-violet-700",
  completion: "bg-emerald-100 text-emerald-700",
  withdrawal: "bg-slate-100 text-slate-400",
  decision: "bg-violet-100 text-violet-700",
}

/**
 * The four families a kind belongs to.
 *
 * Thirteen colours would be a legend nobody can hold; four is a sentence you can
 * read off a bar — what a stretch of life was *made of*. The grouping is by what
 * the act concerns rather than by anything structural, which is why `visit` sits
 * with `occasion` (both are being somewhere) and `decision` with `completion`
 * (both are work resolving).
 */
export type KindFamily = "writing" | "places" | "body" | "work"

export const FAMILY_OF: Record<MomentKind, KindFamily> = {
  capture: "writing",
  reflection: "writing",
  observation: "writing",
  occasion: "places",
  exchange: "places",
  visit: "places",
  measurement: "body",
  dose: "body",
  activity: "body",
  work: "work",
  completion: "work",
  withdrawal: "work",
  decision: "work",
}

/**
 * How much room a moment earns.
 *
 * A dose and a therapy appointment are not the same size of event in a life, and
 * rendering them as identical rows was the timeline's central untruth — it made
 * a day of six supplements look busier than a day with one long conversation in
 * it. Weight is a property of the *act*, which is why it can be a table:
 *
 * - **small** — a thing you did in a moment and would not describe. Dozens a
 *   day, individually unremarkable, collectively a pattern. Shown as a count you
 *   can open, never as dozens of rows.
 * - **medium** — a thing that closed. Worth a line, not a paragraph.
 * - **large** — a thing with content: time you spent somewhere, or words you
 *   wrote. The only kinds that carry a body worth reading in place.
 */
export type Weight = "small" | "medium" | "large"

export const WEIGHT_OF: Record<MomentKind, Weight> = {
  dose: "small",
  measurement: "small",
  activity: "small",
  visit: "small",
  completion: "medium",
  work: "medium",
  withdrawal: "medium",
  exchange: "medium",
  capture: "medium",
  decision: "large",
  occasion: "large",
  reflection: "large",
  observation: "large",
}

export const FAMILIES: { key: KindFamily; label: string; color: string }[] = [
  { key: "writing", label: "writing", color: "var(--family-writing)" },
  { key: "places", label: "places", color: "var(--family-places)" },
  { key: "body", label: "body", color: "var(--family-body)" },
  { key: "work", label: "work", color: "var(--family-work)" },
]

/**
 * Where a moment sits in time: what happened, or failing that where it is meant
 * to.
 *
 * The same expression as `_WHEN` in `routers/moments.py`, and it has to stay
 * that way — the server sorts and buckets the rail by it, so a client that
 * grouped by a different column would draw day headings the stream disagrees
 * with. Tense is not a type: a planned lunch has no occurrence to sort by, only
 * a window.
 */
export function whenOf(m: Moment): Instant | null {
  return m.started_at ?? m.window_start
}

/** An intention nothing came of, and that wasn't dropped on purpose. Derived,
 *  never stored (`window_end < now AND !started_at AND !withdrawn_at`), so it
 *  cannot go stale — the same predicate the API's `unfulfilled` filter applies. */
export function isLapsed(m: Moment, now = new Date()): boolean {
  return (
    !!m.window_end &&
    new Date(m.window_end) < now &&
    m.started_at === null &&
    m.withdrawn_at === null
  )
}

export function linksOf(m: Moment, role: MomentRole): MomentLink[] {
  return m.links.filter((l) => l.role === role)
}

/** The first thing a moment is *about*. The display parent is derived, never a
 *  privileged column — a moment may concern the program and the medication both. */
export function subjectOf(m: Moment): MomentLink | undefined {
  return m.links.find((l) => l.role === "subject")
}

/**
 * Where a moment opens.
 *
 * An occasion opens on the calendar, because that is where you operate one —
 * the grid stays put and the detail floats over it. Everything else opens as
 * itself.
 *
 * This replaced a `sourceRoute` that read `source_ref` and sent occasions to
 * `/calendar/<event id>`. That was right while `events` was still the surface
 * that owned them, and became a 404 the moment `/calendar/:id` started loading
 * moments — every occasion on the timeline led to "not found". A moment's route
 * is a fact about the moment, not about the row it was once derived from.
 */
export function routeForMoment(m: Moment): string {
  return m.kind === "occasion" ? `/calendar/${m.id}` : `/moments/${m.id}`
}

/**
 * What a moment says, in one line.
 *
 * A title is the obvious answer and most moments have one — but the two kinds
 * that never do are the two whose content lives elsewhere. **Every dose and
 * every measurement in the archive is untitled**, because a dose's content is
 * the medication and the amount, and a measurement's *is the number*. Falling
 * back to the kind printed a column of the word "Dose", which is the shape of an
 * act with the act removed.
 *
 * So: the title when there is one; otherwise the thing it concerns, and what the
 * pairing produced. `resolve` is the shared entity index, since a link carries
 * an id and a reader wants a name.
 *
 * Named `describeMoment` rather than `describe`, which every test file already
 * has from vitest.
 */
export function describeMoment(
  m: Moment,
  resolve: (type: EntityType, id: string) => string | undefined,
): string {
  if (m.title) return m.title
  const subject = subjectOf(m)
  const name = subject ? resolve(subject.entity_type, subject.entity_id) : undefined
  const payload = subject
    ? subject.amount != null
      ? `${subject.amount}${subject.unit ? ` ${subject.unit}` : ""}`
      : subject.value != null
        ? String(subject.value)
        : null
    : null
  const parts = [name, payload].filter(Boolean)
  if (parts.length) return parts.join(" · ")
  // A body is a last resort: prose kinds normally have one, and a first line
  // beats a category name.
  const body = (m.body || "").trim().split("\n")[0]
  return body ? body.slice(0, 80) : KIND_LABEL[m.kind]
}

/** Bucket moments into day groups by `whenOf`, preserving the incoming
 *  (newest-first) order. Falls back to `created_at`: a moment with neither
 *  occurrence nor window still has to land somewhere in a stream. */
export function groupMomentsByDay(
  moments: Moment[],
): { key: string; label: string; moments: Moment[] }[] {
  const groups: { key: string; label: string; moments: Moment[] }[] = []
  const byKey = new Map<string, { key: string; label: string; moments: Moment[] }>()
  for (const m of moments) {
    const stamp = whenOf(m) ?? m.created_at
    const key = asDay(stamp)
    let g = byKey.get(key)
    if (!g) {
      g = { key, label: dayLabel(stamp), moments: [] }
      byKey.set(key, g)
      groups.push(g)
    }
    g.moments.push(m)
  }
  return groups
}
