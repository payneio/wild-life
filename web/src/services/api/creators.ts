import { people } from "@/services/api/hooks"
import { REGISTRY } from "@/services/api/registry"
import type { Body } from "@/services/api/crud"
import type { MentionResult } from "@/services/api/mentions"
import type { EntityType } from "@/services/api/types"

/** A quick-create function: name a new row (plus optional prefilled context),
 *  create it, and return a reference to it. */
export type Creator = (name: string, defaults?: Body) => Promise<MentionResult>

/**
 * Inline quick-create for the picker. Returns a map `EntityType → Creator` for
 * every type whose Create schema needs nothing beyond its title (`quickCreate`),
 * plus `person`. Calling every `useCreate()` unconditionally keeps hook order
 * stable; only the eligible ones are exposed.
 *
 * `Object.values(REGISTRY)` is read inside the hook (call time), never at
 * module-eval time — so importing this module can't touch REGISTRY before it's
 * initialized (which TDZ-crashes under import cycles).
 */
export function useEntityCreators(): Partial<Record<EntityType, Creator>> {
  const creators: Partial<Record<EntityType, Creator>> = {}
  // Stable order/length across renders (registry is static) → hook count stable.
  for (const def of Object.values(REGISTRY)) {
    const create = def.crud.useCreate()
    if (!def.entityType || !def.quickCreate || !def.titleField) continue
    const type = def.entityType
    const titleField = def.titleField
    creators[type] = async (name, defaults) => {
      const row = await create.mutateAsync({ [titleField]: name, ...defaults })
      return { type, id: (row as { id: string }).id, label: name }
    }
  }

  // People is a bespoke page, absent from the registry.
  const createPerson = people.useCreate()
  creators.person = async (name, defaults) => {
    const row = await createPerson.mutateAsync({ name, ...defaults })
    return { type: "person", id: (row as { id: string }).id, label: name }
  }

  return creators
}
