import { useCallback } from "react"
import { REGISTRY_BY_TYPE } from "@/services/api/registry"
import { useEntityResolver, useEntityRow } from "@/services/api/mentions"
import { subjectOf, THEME_TYPES, type Theme } from "@/lib/moments"
import type { EntityType, Moment } from "@/services/api/types"

/**
 * Resolve a moment to the standing thing it belongs to.
 *
 * Walks the subject's declared ancestry — task → project → program → area —
 * because almost no moment names a program itself. Nothing here is fetched: the
 * mention resolver already holds every list, so this is a lookup over data the
 * page has, and the chain is the `parent` each object declares rather than
 * anything this module knows about the domain.
 *
 * Bounded at six hops. A cycle in declared ancestry would otherwise hang the
 * render, and a chain longer than six is a modelling problem to be seen, not a
 * loop to be survived.
 */
export function useThemeOf(): (m: Moment) => Theme | undefined {
  const rowOf = useEntityRow()
  const resolve = useEntityResolver()

  return useCallback(
    (moment: Moment) => {
      const subject = subjectOf(moment)
      if (!subject) return undefined
      let type: EntityType = subject.entity_type
      let id: string = subject.entity_id

      for (let hop = 0; hop < 6; hop++) {
        if (THEME_TYPES.includes(type)) {
          const label = resolve(type, id)
          return label ? { type, id, label } : undefined
        }
        const def = REGISTRY_BY_TYPE[type]
        const row = rowOf(type, id)
        const up = def?.parent && row ? def.parent(row) : undefined
        if (!up) return undefined
        type = up.type
        id = up.id
      }
      return undefined
    },
    [rowOf, resolve],
  )
}
