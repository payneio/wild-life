import { useRef, useState } from "react"
import { ChevronDown, X } from "lucide-react"
import { cn } from "@/lib/utils"
import { EntityPicker } from "@/components/graph/EntityPicker"
import { LOOKUP_TO_TYPE } from "@/components/graph/lookupType"
import { useEntityResolver, type PickerIntent } from "@/services/api/mentions"
import type { Body } from "@/services/api/crud"
import type { LookupKey } from "@/services/api/lookups"

/**
 * Form control for a scalar FK field. Replaces the native `<select>` that
 * loaded the entire target table: shows the current selection as text and opens
 * the searchable `EntityPicker` on click. Label resolution reuses the shared
 * (staleTime-pinned) entity index, so no per-field list fetch.
 */
export function EntityRefField({
  lookup,
  value,
  onChange,
  required,
  intent = "assign",
  createDefaults,
}: {
  lookup: LookupKey
  value: string | null
  onChange: (id: string | null) => void
  /** Non-nullable column: offer no clear, since the API would reject null. */
  required?: boolean
  /**
   * Context the picker's inline create should inherit. A scalar FK field sits
   * inside a record that usually knows where the new row belongs — the metric
   * you name on an outcome is measured for whatever that outcome is about — and
   * without it the picker has to withhold "Create" for any type the API roots
   * at birth. See `EntityDef.createRequires`.
   */
  createDefaults?: Body
  /**
   * Setting a scalar FK is normally assignment, so that's the default and the
   * ~45 `F.Ref` fields say nothing. The exception is the health domain, where
   * "resolved" means the episode ended, not that the record is void — you still
   * record the medication you took *for* a resolved condition. Those fields pass
   * `reference` explicitly.
   */
  intent?: PickerIntent
}) {
  const type = LOOKUP_TO_TYPE[lookup]
  const resolve = useEntityResolver()
  const [open, setOpen] = useState(false)
  const btnRef = useRef<HTMLButtonElement>(null)
  const label = value ? resolve(type, value) : undefined

  return (
    <>
      <button
        ref={btnRef}
        type="button"
        onClick={() => setOpen(true)}
        className={cn(
          "flex w-full items-center justify-between gap-2 rounded-lg border border-slate-300 bg-surface px-3 py-1.5 text-left text-sm outline-none transition hover:border-slate-400 focus:border-indigo-500 focus:ring-2 focus:ring-indigo-500/20",
        )}
      >
        <span className={cn("truncate", value ? "text-slate-900" : "text-slate-400")}>
          {value ? (label ?? "…") : "—"}
        </span>
        <span className="flex shrink-0 items-center text-slate-400">
          {value && !required && (
            <span
              role="button"
              tabIndex={-1}
              aria-label="Clear"
              onClick={(e) => {
                e.stopPropagation()
                onChange(null)
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
          intent={intent}
          createDefaults={createDefaults}
          onClose={() => setOpen(false)}
          onSelect={(r) => {
            onChange(r.id)
            setOpen(false)
          }}
        />
      )}
    </>
  )
}
