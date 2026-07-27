import { useEntityRow } from "@/services/api/mentions"
import { REGISTRY_BY_TYPE, type EntityDef } from "@/services/api/registry"
import type { EntityType } from "@/services/api/types"

/** A link to one object. What `EntityDef.parent` returns. */
type Ref = { type: EntityType; id: string }

/** One rung above an object: enough to name it and go there. */
export interface Crumb extends Ref {
  /** Undefined while the resolver's lists are still loading. */
  label?: string
}

/**
 * How deep a chain may go. Area → Program → Project → Task is four, and the
 * hierarchy has no fifth rung; the cap is here so a cycle introduced by a future
 * `parent` — an outcome rooted to an outcome — cannot hang the render.
 */
const MAX_DEPTH = 6

/**
 * The chain of objects an object sits inside, outermost first.
 *
 * Derived by asking each rung for its `parent` and asking *that* rung the same
 * question, which is why a project can show its area without storing one. The
 * walk is over rows already in the query cache (pinned `staleTime`), so it costs
 * no request; a rung whose row hasn't loaded yet yields a crumb with no label
 * rather than truncating the chain, so the breadcrumb doesn't change shape as
 * data arrives.
 */
export function useAncestry(
  type: EntityType | undefined,
  id: string | undefined,
): Crumb[] {
  const rowOf = useEntityRow()
  if (!type || !id) return []

  const crumbs: Crumb[] = []
  const seen = new Set<string>([`${type}:${id}`])
  let cursor: Ref | undefined = { type, id }

  for (let depth = 0; depth < MAX_DEPTH && cursor; depth++) {
    const def: EntityDef | undefined = REGISTRY_BY_TYPE[cursor.type]
    const row = rowOf(cursor.type, cursor.id)
    const up: Ref | undefined = def?.parent && row ? def.parent(row) : undefined
    if (!up) break
    const key = `${up.type}:${up.id}`
    if (seen.has(key)) break
    seen.add(key)
    const upDef = REGISTRY_BY_TYPE[up.type]
    const upRow = rowOf(up.type, up.id)
    crumbs.unshift({
      ...up,
      label: upDef && upRow ? String(upDef.title(upRow)) : undefined,
    })
    cursor = up
  }
  return crumbs
}
