/**
 * @-mention plumbing for notes. A mention is stored in a note body as a markdown
 * link `[@Label](type:id)` and mirrored into the note's `links`. Search, label
 * resolution, and route mapping are all derived from the entity REGISTRY (+ people,
 * which is a bespoke page not in the registry) — no backend search endpoint.
 */
import { people } from "@/services/api/hooks"
import { useSelfPersonId } from "@/services/api/identity"
import { isTerminal } from "@/services/api/lifecycle"
import { REGISTRY } from "@/services/api/registry"
import type { EntityType } from "@/services/api/types"

export { routeFor, ROUTE_BY_TYPE } from "@/services/api/routes"

export interface MentionResult {
  type: EntityType
  id: string
  label: string
}

/* eslint-disable @typescript-eslint/no-explicit-any */
interface Source {
  type: EntityType
  label: string
  useList: (params?: any, options?: { staleTime?: number }) => { data?: any[] }
  title: (e: any) => string
  parent?: (e: any) => { type: EntityType; id: string } | undefined
  context?: (e: any, resolve: (type: EntityType, id: string) => string | undefined) => string | undefined
}

/** A source paired with its currently-loaded rows. */
type SourceList = { s: Source; data: any[] }

// The resolver/typeahead only READ these lists to label existing chips and power
// the mention picker; they must never trigger a refetch just by mounting (that's
// the 24-endpoint fan-out on every note render / edit-toggle). Pin staleTime so
// mounting is free; explicit invalidation (own writes + SSE) still refetches them
// on real change, so labels stay current.
const RESOLVER_OPTS = { staleTime: Infinity }

const PERSON_SOURCE: Source = {
  type: "person",
  label: "Person",
  useList: people.useList,
  title: (e) => e.name,
  context: (e) => e.role ?? e.relationship ?? undefined,
}

// Every mentionable source: registry entries that carry an `entityType`, plus
// `person` (People is a bespoke page, absent from the registry). Built lazily on
// first use — never at module-eval time — so importing this module can't touch
// REGISTRY before it's initialized (which TDZ-crashes under import cycles).
let _sources: Source[] | null = null
function mentionSources(): Source[] {
  if (_sources) return _sources
  const registrySources = Object.values(REGISTRY)
    .filter((d) => d.entityType)
    .map((d) => ({
      type: d.entityType as EntityType,
      label: d.label,
      // Scoped to the rows this object *is* — one table can back several (see
      // `listParams`). A caller passing its own params has already said what it
      // wants and is left alone.
      useList: (params?: any, options?: { staleTime?: number }) =>
        d.crud.useList(params ?? d.listParams, options),
      title: d.title,
      parent: d.parent,
      context: d.context,
    }))
  _sources = [PERSON_SOURCE, ...registrySources]
  return _sources
}
/* eslint-enable @typescript-eslint/no-explicit-any */

let _labelByType: Partial<Record<EntityType, string>> | null = null
export const typeLabel = (type: EntityType): string => {
  if (!_labelByType) {
    _labelByType = Object.fromEntries(mentionSources().map((s) => [s.type, s.label]))
  }
  return _labelByType[type] ?? type
}

/**
 * What a picker is *for*, which decides whether finished rows may be offered.
 *
 *  - `assign`    — creating a live relationship (a scalar FK, re-parenting a row,
 *    linking a project to an outcome). Selecting a completed or archived row would
 *    author a contradiction: a live child under a dead parent. Terminal rows are
 *    withheld behind a reveal.
 *  - `reference` — naming something that exists (an @-mention, rooting a note,
 *    choosing which duplicate survives a merge). History is the point; a note
 *    about a finished project is the normal case. Nothing is withheld.
 *
 * Required at every call site, never defaulted: both possible defaults fail
 * *silently* for a picker written later — default-assign would hide history from
 * a new mention picker, default-reference would offer dead rows in a new
 * assignment picker. The compiler asking "which is this?" is the whole point.
 */
export type PickerIntent = "assign" | "reference"

/** A search hit plus what a picker needs to render and reason about it. */
export interface PickerRow extends MentionResult {
  /** Present only for status-bearing types. */
  status?: string
  terminal: boolean
  /** Muted subtitle — what distinguishes this row from its namesakes. */
  context?: string
}

export interface PickerResults {
  /** Sorted, filtered, truncated — render these. */
  shown: PickerRow[]
  /** Terminal rows withheld by `assign` (always empty under `reference`). */
  hidden: PickerRow[]
  /** Matches dropped by the display cap — surface, never swallow. */
  truncated: number
  /**
   * An exact label match anywhere in the **unfiltered** set. Returned by the hook
   * rather than derived by callers, so a picker cannot compute "does this already
   * exist?" over the filtered rows and offer to create a duplicate of something it
   * merely hid.
   */
  exact?: PickerRow
}

/** How many rows a picker will render before it stops and says so. */
const MAX_ROWS = 20

/** Typeahead across every mentionable source (client-side, registry-driven).
 * Cheap enough (single-user data) to recompute each render — no memo. */
export function useEntitySearch(
  query: string,
  opts: {
    type?: EntityType
    excludeId?: string
    intent: PickerIntent
    /** Cross-type fairness only — see `cap` below. */
    limitPerType?: number
    limit?: number
  },
): PickerResults {
  const { type, excludeId, intent, limitPerType = 6, limit = MAX_ROWS } = opts
  const selfId = useSelfPersonId()
  // NB: call useList for every source (stable hook count); filter afterwards.
  const lists = mentionSources().map((s) => ({ s, data: s.useList(undefined, RESOLVER_OPTS).data ?? [] }))
  const q = query.trim().toLowerCase()

  // `limitPerType` exists to stop one big source (1300 events) crowding every
  // other type out of the shared result list. Scoped to a single `type` there is
  // only one source, so the quota is meaningless — and enforcing it anyway is
  // what capped every FK picker in the app at 6 options. The rule lives here so
  // no call site has to know it.
  const cap = type ? Infinity : limitPerType
  const byType = new Map(
    lists.map(({ s, data }) => [s.type, { s, rows: new Map(data.map((e) => [e.id, e])) }]),
  )

  const all: PickerRow[] = []
  for (const { s, data } of lists) {
    if (type && s.type !== type) continue
    let n = 0
    for (const e of data) {
      if (excludeId && e.id === excludeId) continue
      const label = s.title(e) ?? ""
      if (q && !label.toLowerCase().includes(q)) continue
      const status = typeof e.status === "string" ? e.status : undefined
      all.push({ type: s.type, id: e.id, label, status, terminal: isTerminal(s.type, status) })
      if (++n >= cap) break
    }
  }
  // You, first — in a picker that is *only* people (every Assignee / Responsible
  // / Owner field), the person you most often mean is yourself. Scoped to
  // `type === "person"` on purpose: in a cross-type picker hoisting one person
  // above every project and note would be noise, not help.
  const pinSelf = type === "person" && !!selfId
  // Prefix matches first, then alphabetical.
  all.sort((a, b) => {
    if (pinSelf) {
      const as = a.id === selfId ? 0 : 1
      const bs = b.id === selfId ? 0 : 1
      if (as !== bs) return as - bs
    }
    const ap = a.label.toLowerCase().startsWith(q) ? 0 : 1
    const bp = b.label.toLowerCase().startsWith(q) ? 0 : 1
    return ap - bp || a.label.localeCompare(b.label)
  })

  const exact = q ? all.find((r) => r.label.toLowerCase() === q) : undefined
  const matching = intent === "assign" ? all.filter((r) => !r.terminal) : all
  const hidden = intent === "assign" ? all.filter((r) => r.terminal) : []

  // Only the rows that will actually render — resolving a parent per row is
  // cheap, but doing it for 1300 events that nobody sees is not.
  const index = buildIndex(lists)
  const withContext = (r: PickerRow): PickerRow => {
    const src = byType.get(r.type)
    const row = src?.rows.get(r.id)
    if (!row || !src) return r
    // A declared `context` wins — it was chosen over the parent deliberately.
    // Otherwise the parent's name is the thing that tells namesakes apart, and
    // it costs the object nothing to say, having already declared its ancestry.
    const own = src.s.context?.(row, (ty, id) => index.get(`${ty}:${id}`))
    const up = src.s.parent?.(row)
    const context = own ?? (up ? index.get(`${up.type}:${up.id}`) : undefined)
    return context ? { ...r, context } : r
  }

  return {
    shown: matching.slice(0, limit).map(withContext),
    hidden,
    truncated: Math.max(0, matching.length - limit),
    exact: exact ? withContext(exact) : undefined,
  }
}

/** One traversal shape shared by the resolver and the picker's context lookup. */
function buildIndex(lists: SourceList[]): Map<string, string> {
  const map = new Map<string, string>()
  for (const { s, data } of lists) {
    for (const e of data) map.set(`${s.type}:${e.id}`, s.title(e))
  }
  return map
}

/** Resolve any (type,id) → current display label from the loaded lists.
 * Called once per rendered note; cheap because memoized JournalEntry rows that
 * don't change skip rendering (and this hook) entirely. */
/**
 * The whole row behind a (type, id), from the same pinned lists the resolver
 * uses — so nothing refetches just because something asked.
 *
 * A label is enough to *print* a reference; walking a chain needs the row, since
 * the next link up is a field on it. `useAncestry` is the only caller.
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function useEntityRow(): (type: EntityType, id: string) => any | undefined {
  const lists = mentionSources().map((s) => ({ s, data: s.useList(undefined, RESOLVER_OPTS).data ?? [] }))
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const map = new Map<string, any>()
  for (const { s, data } of lists) {
    for (const e of data) map.set(`${s.type}:${e.id}`, e)
  }
  return (type: EntityType, id: string) => map.get(`${type}:${id}`)
}

export function useEntityResolver(): (type: EntityType, id: string) => string | undefined {
  const lists = mentionSources().map((s) => ({ s, data: s.useList(undefined, RESOLVER_OPTS).data ?? [] }))
  // Indexes every row, terminal ones included — a chip pointing at an archived
  // project must still render its name, even where a picker won't offer it.
  const map = buildIndex(lists)
  return (type: EntityType, id: string) => map.get(`${type}:${id}`)
}

const MENTION_RE = /\[@([^\]]+)\]\((\w+):([0-9a-fA-F-]{36})\)/g

/** Extract the mentions embedded in a note body. */
export function parseMentions(body: string): MentionResult[] {
  const out: MentionResult[] = []
  for (const m of body.matchAll(MENTION_RE)) {
    out.push({ label: m[1], type: m[2] as EntityType, id: m[3] })
  }
  return out
}

/** The markdown token for a mention. */
export function mentionToken(r: MentionResult): string {
  return `[@${r.label}](${r.type}:${r.id})`
}

/** Union a body's inline mentions with manual chips, deduped by type+id. */
export function mergeLinks(
  body: string,
  manual: MentionResult[],
): MentionResult[] {
  const seen = new Set<string>()
  const out: MentionResult[] = []
  for (const r of [...parseMentions(body), ...manual]) {
    const key = `${r.type}:${r.id}`
    if (seen.has(key)) continue
    seen.add(key)
    out.push(r)
  }
  return out
}
