/**
 * @-mention plumbing for notes. A mention is stored in a note body as a markdown
 * link `[@Label](type:id)` and mirrored into the note's `links`. Search, label
 * resolution, and route mapping are all derived from the entity REGISTRY (+ people,
 * which is a bespoke page not in the registry) — no backend search endpoint.
 */
import { people } from "@/services/api/hooks"
import { REGISTRY } from "@/services/api/registry"
import type { EntityType } from "@/services/api/types"

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
}

// The resolver/typeahead only READ these lists to label existing chips and power
// the mention picker; they must never trigger a refetch just by mounting (that's
// the 24-endpoint fan-out on every note render / edit-toggle). Pin staleTime so
// mounting is free; explicit invalidation (own writes + SSE) still refetches them
// on real change, so labels stay current.
const RESOLVER_OPTS = { staleTime: Infinity }

// Every mentionable source: registry entries that carry an `entityType`, plus
// `person` (People is a bespoke page, absent from the registry).
const REGISTRY_SOURCES: Source[] = Object.values(REGISTRY)
  .filter((d) => d.entityType)
  .map((d) => ({
    type: d.entityType as EntityType,
    label: d.label,
    useList: d.crud.useList,
    title: d.title,
  }))

const PERSON_SOURCE: Source = {
  type: "person",
  label: "Person",
  useList: people.useList,
  title: (e) => e.name,
}

export const MENTION_SOURCES: Source[] = [PERSON_SOURCE, ...REGISTRY_SOURCES]
/* eslint-enable @typescript-eslint/no-explicit-any */

// Detail-route base for each type (matches router/routes.tsx). Types without a
// deep-link detail route are omitted → their chips render as plain (non-link) text.
export const ROUTE_BY_TYPE: Partial<Record<EntityType, string>> = {
  area: "areas",
  program: "programs",
  project: "projects",
  task: "tasks",
  routine: "routines",
  goal: "goals",
  metric: "metrics",
  delegation: "delegations",
  note: "notes",
  event: "events",
  commitment: "commitments",
  waiting_item: "waiting",
  decision: "decisions",
  resource: "resources",
  person: "people",
  organization: "organizations",
  location: "locations",
  condition: "conditions",
  medication: "medications",
  protocol: "protocols",
  health_event: "health-events",
  insurance_plan: "insurance",
  allergy: "allergies",
}

/** Detail route path for a mention, or undefined if the type has no detail route. */
export function routeFor(type: EntityType, id: string): string | undefined {
  const base = ROUTE_BY_TYPE[type]
  return base ? `/${base}/${id}` : undefined
}

const LABEL_BY_TYPE: Partial<Record<EntityType, string>> = Object.fromEntries(
  MENTION_SOURCES.map((s) => [s.type, s.label]),
)
export const typeLabel = (type: EntityType): string => LABEL_BY_TYPE[type] ?? type

/** Typeahead across every mentionable source (client-side, registry-driven).
 * Cheap enough (single-user data) to recompute each render — no memo. */
export function useEntitySearch(
  query: string,
  opts: { type?: EntityType; excludeId?: string; limitPerType?: number } = {},
): MentionResult[] {
  const { type, excludeId, limitPerType = 6 } = opts
  // NB: call useList for every source (stable hook count); filter afterwards.
  const lists = MENTION_SOURCES.map((s) => ({ s, data: s.useList(undefined, RESOLVER_OPTS).data ?? [] }))
  const q = query.trim().toLowerCase()
  const out: MentionResult[] = []
  for (const { s, data } of lists) {
    if (type && s.type !== type) continue
    let n = 0
    for (const e of data) {
      if (excludeId && e.id === excludeId) continue
      const label = s.title(e) ?? ""
      if (q && !label.toLowerCase().includes(q)) continue
      out.push({ type: s.type, id: e.id, label })
      if (++n >= limitPerType) break
    }
  }
  // Prefix matches first, then alphabetical.
  return out.sort((a, b) => {
    const ap = a.label.toLowerCase().startsWith(q) ? 0 : 1
    const bp = b.label.toLowerCase().startsWith(q) ? 0 : 1
    return ap - bp || a.label.localeCompare(b.label)
  })
}

/** Resolve any (type,id) → current display label from the loaded lists. */
export function useEntityResolver(): (type: EntityType, id: string) => string | undefined {
  const lists = MENTION_SOURCES.map((s) => ({ s, data: s.useList(undefined, RESOLVER_OPTS).data ?? [] }))
  const map = new Map<string, string>()
  for (const { s, data } of lists) {
    for (const e of data) map.set(`${s.type}:${e.id}`, s.title(e))
  }
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
