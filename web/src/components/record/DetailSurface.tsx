import { EditableRecord } from "@/components/EditableRecord"
import type { EntityDef } from "@/services/api/registry"
import type { Entity } from "@/services/api/types"

/**
 * Picks the detail surface for an entity — the one seam where the converted and
 * unconverted worlds meet.
 *
 * An entity either owns its layout (`def.detail`, composed from the `Record`
 * primitives) or falls back to the generic `EditableRecord` that walks
 * `def.fields`. There is no in-between: the override is total, so nothing has to
 * coordinate about which half renders which field.
 *
 * When every def carries `detail`, this fallback and everything under it —
 * `EditableRecord`, `EntityForm`'s field switch, `fields.ts`, `extra`,
 * `detailHide` — becomes unreachable and gets deleted. That end state is
 * mechanically detectable rather than tracked in a document.
 */
export function DetailSurface({
  def,
  entity,
  onClose,
  onDelete,
  variant = "page",
}: {
  def: EntityDef
  entity: Entity
  onClose: () => void
  onDelete?: () => void
  variant?: "page" | "pane"
}) {
  if (def.detail) return <def.detail entity={entity} onClose={onClose} onDelete={onDelete} />
  return (
    <EditableRecord
      def={def}
      entity={entity}
      onClose={onClose}
      onDelete={onDelete}
      variant={variant}
    />
  )
}
