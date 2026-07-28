import { useRef, useState } from "react"
import { Home } from "lucide-react"
import { EntityPicker } from "@/components/graph/EntityPicker"
import type { EntityType } from "@/services/api/types"

/**
 * A one-shot "set home" picker: search any entity type, pick once, get the
 * `(type, id)` pair back. The write it feeds is the soft-poly root, so it is
 * deliberately lighter than `NoteRootField` (a type select *then* a row picker)
 * — filing is one gesture whether you do it while writing or while triaging.
 */
export function HomePicker({
  label = "Set home…",
  placeholder = "File in… (search any area, project, person…)",
  onPick,
}: {
  label?: string
  placeholder?: string
  onPick: (type: EntityType, id: string) => void
}) {
  const [open, setOpen] = useState(false)
  const ref = useRef<HTMLButtonElement>(null)
  return (
    <>
      <button
        ref={ref}
        type="button"
        onClick={() => setOpen(true)}
        className="inline-flex shrink-0 items-center gap-1 rounded-lg border border-slate-300 bg-surface px-2 py-1 text-xs font-medium text-slate-600 transition hover:border-slate-400 hover:text-slate-900"
      >
        <Home size={12} /> {label}
      </button>
      {open && (
        <EntityPicker
          getAnchor={() => ref.current}
          allowCreate={false}
          // Filing is historical: a 2024 meeting belongs in the project that
          // shipped, and an entry written tonight may be about a finished one.
          // Same poly-link write as NoteRootField, so it must have the same
          // policy — classify by the write, not the label.
          intent="reference"
          placeholder={placeholder}
          onClose={() => setOpen(false)}
          onSelect={(r) => {
            onPick(r.type, r.id)
            setOpen(false)
          }}
        />
      )}
    </>
  )
}
