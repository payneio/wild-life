import { Link } from "react-router-dom"
import { NotebookPen } from "lucide-react"
import { formatDate } from "@/lib/utils"
import { useNotesLinkedTo } from "@/services/api/hooks"
import type { EntityType } from "@/services/api/types"

/**
 * "Mentioned in" — notes that reference this entity from *somewhere else*.
 *
 * A note filed here and mentioning here is one note, and the Notes panel above
 * already lists it: on an area with 83 rooted notes, 18 of the 20 mentions were
 * the same rows repeated. What this panel is for is the reference you would
 * otherwise miss — a note living under another area that talks about this one —
 * so a note whose root *is* this entity is dropped.
 *
 * `NotesPage.tsx:117` applies the same rule from the other side, dropping a
 * note's own root from its mention chips.
 */
export function Backlinks({ type, id }: { type: EntityType; id: string }) {
  const { data } = useNotesLinkedTo(type, id)
  const notes = (data ?? []).filter(
    (n) => !(n.entity_type === type && n.entity_id === id),
  )
  if (notes.length === 0) return null
  return (
    <div>
      <h3 className="mb-2 flex items-center gap-1.5 text-xs font-medium uppercase tracking-wide text-slate-400">
        <NotebookPen size={13} /> Mentioned in
      </h3>
      <ul className="max-h-80 space-y-1 overflow-y-auto pr-1">
        {notes.map((n) => (
          <li key={n.id}>
            <Link
              to={`/notes/${n.id}`}
              onClick={(e) => e.stopPropagation()}
              className="flex items-center justify-between gap-2 rounded-lg border border-slate-100 px-2.5 py-1.5 text-sm hover:bg-slate-50"
            >
              <span className="break-words text-slate-700">{n.title || "(untitled)"}</span>
              {n.entry_date && (
                <span className="shrink-0 text-xs text-slate-400">{formatDate(n.entry_date)}</span>
              )}
            </Link>
          </li>
        ))}
      </ul>
    </div>
  )
}
