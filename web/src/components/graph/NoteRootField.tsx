import { useRef, useState } from "react"
import { ChevronDown, X } from "lucide-react"
import { EntityPicker } from "@/components/graph/EntityPicker"
import { cn } from "@/lib/utils"
import { typeLabel, useEntityResolver } from "@/services/api/mentions"
import type { EntityType } from "@/services/api/types"

/**
 * The entity a note is *rooted to* (its scalar entity_type/entity_id owner —
 * "is about", singular), as opposed to the mentions it references. Polymorphic:
 * pick a type, then pick a row, writing both columns at once. Used only on the
 * note detail, so a note can be re-rooted or a promoted scratch-blob re-homed.
 */
const ROOTABLE_TYPES: EntityType[] = [
  "area",
  "program",
  "project",
  "goal",
  "task",
  "event",
  "person",
  "commitment",
  "request",
  "delegation",
  "review",
  "decision",
  "resource",
  "organization",
  "location",
  "metric",
  "condition",
  "medication",
  "protocol",
  "insurance_plan",
  "allergy",
  "routine",
]

export function NoteRootField({
  entityType,
  entityId,
  onSave,
}: {
  entityType: string | null
  entityId: string | null
  onSave: (body: { entity_type: string | null; entity_id: string | null }) => void
}) {
  const resolve = useEntityResolver()
  const [open, setOpen] = useState(false)
  const btnRef = useRef<HTMLButtonElement>(null)
  const type = (entityType as EntityType | null) ?? null
  const label = type && entityId ? resolve(type, entityId) : undefined

  return (
    <div className="flex flex-col gap-2 sm:flex-row">
      <select
        value={entityType ?? ""}
        className="rounded-lg border border-slate-300 bg-surface px-2 py-1.5 text-sm outline-none focus:border-indigo-500 focus:ring-2 focus:ring-indigo-500/20"
        // Switching the type clears the row until a new one is picked.
        onChange={(e) => onSave({ entity_type: e.target.value || null, entity_id: null })}
      >
        <option value="">— (unrooted)</option>
        {ROOTABLE_TYPES.map((t) => (
          <option key={t} value={t}>
            {typeLabel(t)}
          </option>
        ))}
      </select>

      {type && (
        <>
          <button
            ref={btnRef}
            type="button"
            onClick={() => setOpen(true)}
            className="flex flex-1 items-center justify-between gap-2 rounded-lg border border-slate-300 bg-surface px-3 py-1.5 text-left text-sm outline-none transition hover:border-slate-400 focus:border-indigo-500 focus:ring-2 focus:ring-indigo-500/20"
          >
            <span className={cn("truncate", entityId ? "text-slate-900" : "text-slate-400")}>
              {entityId ? (label ?? "…") : `Pick a ${typeLabel(type).toLowerCase()}…`}
            </span>
            <span className="flex shrink-0 items-center text-slate-400">
              {entityId && (
                <span
                  role="button"
                  tabIndex={-1}
                  aria-label="Clear"
                  onClick={(e) => {
                    e.stopPropagation()
                    onSave({ entity_type: entityType, entity_id: null })
                  }}
                  className="rounded p-0.5 hover:text-red-600"
                >
                  <X size={14} />
                </span>
              )}
              <ChevronDown size={14} />
            </span>
          </button>
          {open && (
            <EntityPicker
              getAnchor={() => btnRef.current}
              type={type}
              allowCreate={false}
              onClose={() => setOpen(false)}
              onSelect={(r) => {
                onSave({ entity_type: r.type, entity_id: r.id })
                setOpen(false)
              }}
            />
          )}
        </>
      )}
    </div>
  )
}
