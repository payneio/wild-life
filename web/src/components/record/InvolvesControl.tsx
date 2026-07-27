import { useState } from "react"
import { Boxes, Check } from "lucide-react"
import { Button } from "@/components/ui/primitives"
import { cn } from "@/lib/utils"
import { optionalPanels, type EntityDef } from "@/services/api/registry"
import type { Entity, EntityType } from "@/services/api/types"

/**
 * What kinds of thing this program concerns itself with.
 *
 * A fact about the object, not a display setting: "IMO involves medications" is
 * true of IMO whether or not there's a UI. It decides whether an *empty* panel is
 * offered — a panel with rows in it always shows, because turning something off
 * must never hide data (see `RelatedPanel`).
 */
export function InvolvesControl({
  def,
  entity,
  onSave,
}: {
  def: EntityDef
  entity: Entity
  onSave: (involves: EntityType[]) => void
}) {
  const [open, setOpen] = useState(false)
  const optional = optionalPanels(def)
  if (optional.length === 0) return null

  const current = ((entity as unknown as { involves?: EntityType[] }).involves ??
    []) as EntityType[]
  const toggle = (type: EntityType) =>
    onSave(
      current.includes(type) ? current.filter((t) => t !== type) : [...current, type],
    )

  return (
    <div className="relative">
      <Button variant="ghost" size="sm" onClick={() => setOpen((v) => !v)}>
        <Boxes size={14} /> Involves
      </Button>
      {open && (
        <>
          <div className="fixed inset-0 z-10" onClick={() => setOpen(false)} />
          <div className="absolute left-0 z-20 mt-1 w-56 rounded-xl border border-slate-200 bg-surface p-1 shadow-lg">
            <p className="px-2 py-1.5 text-[11px] text-slate-400">
              What this involves
            </p>
            {optional.map((r) => {
              const on = current.includes(r.type)
              return (
                <button
                  key={r.type}
                  type="button"
                  onClick={() => toggle(r.type)}
                  className={cn(
                    "flex w-full items-center gap-2 rounded-lg px-2 py-1.5 text-left text-sm transition",
                    on ? "text-slate-800" : "text-slate-500",
                    "hover:bg-slate-50",
                  )}
                >
                  <Check
                    size={14}
                    className={on ? "text-indigo-600" : "text-transparent"}
                  />
                  {r.label}
                </button>
              )
            })}
          </div>
        </>
      )}
    </div>
  )
}
