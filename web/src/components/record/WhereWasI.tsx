import { MapPin } from "lucide-react"
import { Link } from "react-router-dom"
import { useFields } from "@/components/record/context"
import { usePresence } from "@/services/api/hooks"

/**
 * Where you were when this happened.
 *
 * The point of the whole location tier, and the reason no record needed a new
 * column for it. A visit is a timestamped interval, so "where was I at T" is a
 * *query* — which means every timestamped record in the app gains a place
 * dimension for free, with no foreign key to backfill and nothing to keep in
 * sync when a fence moves.
 *
 * It also answers retroactively. A note written somewhere you had not yet named
 * gets its place the moment you draw that fence, because the answer is derived
 * rather than stamped. A stored `location_id` could never do that.
 *
 * Claims no fields — it reads one the layout already renders.
 */
export function WhereWasI({ field }: { field: string }) {
  const { row } = useFields([])
  const at = row[field] as string | null | undefined
  const { data } = usePresence(at ?? undefined)

  if (!at) return null
  const places = data?.places ?? []
  if (places.length === 0) return null

  // Innermost first from the API; the rest is the containing breadcrumb, which
  // is worth keeping as a title rather than a wall of chips.
  const [closest, ...outer] = places

  return (
    <div className="sm:col-span-2">
      <Link
        to={`/locations/${closest.location_id}`}
        title={outer.length > 0 ? `in ${outer.map((p) => p.name).join(", ")}` : undefined}
        className="inline-flex items-center gap-1.5 rounded-full bg-teal-50 px-2.5 py-1 text-xs font-medium text-teal-800 hover:underline dark:bg-teal-950/50 dark:text-teal-200"
      >
        <MapPin size={12} />
        {closest.name}
        {outer.length > 0 && (
          <span className="font-normal opacity-60">+{outer.length}</span>
        )}
      </Link>
    </div>
  )
}
