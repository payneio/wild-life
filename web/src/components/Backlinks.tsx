import { Link } from "react-router-dom"
import { NotebookPen } from "lucide-react"
import { formatDate } from "@/lib/utils"
import { useMomentsMentioning } from "@/services/api/hooks"
import { describeMoment, whenOf } from "@/lib/moments"
import { useEntityResolver } from "@/services/api/mentions"
import type { EntityType } from "@/services/api/types"

/**
 * "Mentioned in" — moments that reference this entity from *somewhere else*.
 *
 * A moment about this thing is already the Log above; listing it again is what
 * made 18 of 20 rows on an 83-entry area duplicates. The role vocabulary now
 * states the difference instead of a filter re-deriving it: `subject` puts a
 * moment on a thing's timeline, `mention` puts it in that thing's backlinks, and
 * the query asks for the second.
 */
export function Backlinks({ type, id }: { type: EntityType; id: string }) {
  const { data } = useMomentsMentioning(type, id)
  const resolve = useEntityResolver()
  const rows = data ?? []
  if (rows.length === 0) return null
  return (
    <div>
      <h3 className="mb-2 flex items-center gap-1.5 text-xs font-medium uppercase tracking-wide text-slate-400">
        <NotebookPen size={13} /> Mentioned in
      </h3>
      <ul className="max-h-80 space-y-1 overflow-y-auto pr-1">
        {rows.map((m) => {
          const when = whenOf(m)
          return (
            <li key={m.id}>
              <Link
                to={`/moments/${m.id}`}
                onClick={(e) => e.stopPropagation()}
                className="flex items-center justify-between gap-2 rounded-lg border border-slate-100 px-2.5 py-1.5 text-sm hover:bg-slate-50"
              >
                <span className="break-words text-slate-700">
                  {describeMoment(m, resolve)}
                </span>
                {when && <span className="shrink-0 text-xs text-slate-400">{formatDate(when)}</span>}
              </Link>
            </li>
          )
        })}
      </ul>
    </div>
  )
}
