import { Fragment } from "react"
import { ChevronRight } from "lucide-react"
import { EntityRef } from "@/components/graph/EntityRef"
import { useAncestry } from "@/services/api/ancestry"
import type { EntityType } from "@/services/api/types"

/**
 * Where this record sits, as a trail you can walk.
 *
 * Chrome, not a field. Which program a project serves *is* an editable property
 * and the layout renders it as a picker; this is the same relationship in its
 * other role — the way out of here — plus the rungs above it, which are not
 * properties of this object at all. A project has no area to edit, but it is
 * very much in one.
 *
 * Lives in `Record`, so every framing gets it for the same reason: pane, modal
 * and full page all show the same record, and "what am I inside" doesn't change
 * with the window it's in.
 *
 * Claims no fields — it reads links the layout already renders, or (for the
 * outer rungs) none the layout could render.
 */
export function Ancestry({ type, id }: { type?: EntityType; id?: string }) {
  const crumbs = useAncestry(type, id)
  if (crumbs.length === 0) return null

  return (
    <nav
      aria-label="Breadcrumb"
      className="flex flex-wrap items-center gap-x-0.5 gap-y-1 text-xs text-slate-400"
    >
      {crumbs.map((c, i) => (
        <Fragment key={`${c.type}:${c.id}`}>
          {i > 0 && <ChevronRight size={12} className="shrink-0 opacity-60" />}
          <EntityRef
            type={c.type}
            id={c.id}
            className="max-w-[16rem] truncate rounded px-0.5 py-0.5 font-medium hover:text-indigo-600"
          >
            {/* A rung whose row hasn't arrived keeps its place rather than
                letting the trail reflow as the lists resolve. */}
            {c.label ?? "…"}
          </EntityRef>
        </Fragment>
      ))}
    </nav>
  )
}
