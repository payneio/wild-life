import { Record, RecordSection } from "@/components/record/Record"
import { useField } from "@/components/record/context"
import { recordFields } from "@/components/record/typed"
import { REGISTRY } from "@/services/api/registry"
import type { Entity, Tag } from "@/services/api/types"

const F = recordFields<Tag>()

/** The colour, shown as the swatch it actually is rather than a hex string. */
function ColorField() {
  const { value, save } = useField("color")
  const color = (value as string | null) ?? ""
  return (
    <div>
      <div className="text-[11px] font-medium uppercase tracking-wide text-slate-400">Colour</div>
      <div className="mt-0.5 flex items-center gap-2">
        <input
          type="color"
          value={color || "#4f46e5"}
          onChange={(e) => save(e.target.value)}
          className="h-8 w-10 cursor-pointer rounded-md border border-slate-200 bg-transparent"
        />
        <input
          type="text"
          value={color}
          placeholder="#4f46e5"
          onChange={(e) => save(e.target.value || null)}
          className="w-28 rounded-md border border-transparent bg-transparent px-2 py-1 font-mono text-sm text-slate-600 transition hover:border-slate-200 focus:border-indigo-400 focus:outline-none"
        />
      </div>
    </div>
  )
}

/**
 * The plain case, and the point of converting it second: a value-object with two
 * fields needs no bespoke machinery — just the vocabulary. The old surface split
 * this across a generic text grid plus a read-only swatch below it; here the
 * swatch *is* the editor.
 */
export function TagDetail({ entity, onClose }: { entity: Entity; onClose: () => void }) {
  return (
    <Record def={REGISTRY.tag} entity={entity} onClose={onClose}>
      <RecordSection>
        <F.Title field="name" placeholder="Tag name" />
        <ColorField />
      </RecordSection>
    </Record>
  )
}
