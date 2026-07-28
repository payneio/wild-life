// The moment vocabulary, on the frontend side.
//
// `MomentKind` names **the act a moment is** — never its subject, never its
// target type, never its tense (see `api/docs/moments.md`). Every kind is
// written by the surface that creates the moment; no surface asks the user. So
// what lives here is what the *reader* needs: how to say a kind out loud, which
// kinds carry prose you wrote, and where a moment sits in time.

import { asDay, dayLabel, type Instant } from "@/lib/date"
import { ROUTE_BY_TYPE } from "@/services/api/routes"
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
 * Where a mirrored moment came from, as a route.
 *
 * `source_ref` names the row a backfilled moment was built from — `note:<uuid>`,
 * `event:<uuid>`, `task:<uuid>:completion`. While those surfaces still author
 * their own rows, the moment is a read-only projection of one, and the useful
 * click is through to the thing that owns it. Null once nothing has two homes.
 */
export function sourceRoute(m: Moment): string | undefined {
  if (!m.source_ref) return undefined
  const [type, id] = m.source_ref.split(":")
  if (!id) return undefined
  // The calendar is where an event is operated, not `/events/:id`.
  if (type === "event") return `/calendar/${id}`
  const base = ROUTE_BY_TYPE[type as EntityType]
  return base ? `/${base}/${id}` : undefined
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
