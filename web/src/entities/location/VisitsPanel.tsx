import { useFields } from "@/components/record/context"
import { useLocationVisits } from "@/services/api/hooks"
import type { LocationVisit } from "@/services/api/types"

/**
 * Time spent inside this fence.
 *
 * Bespoke and read-only rather than a `relations` panel on the registry entry.
 * `fk-children` resolves its target through the entity registry and offers a
 * quick-create, which would mean registering `location_visit` as a first-class
 * object with its own detail — exactly the object-model membership a derived
 * record should not have. Visits are computed from readings; the only honest
 * affordance here is looking at them.
 *
 * Claims no fields (`useFields([])`), so it does not affect coverage — the same
 * escape hatch the maps link uses.
 */

function minutes(visit: LocationVisit): number {
  const end = visit.exited_at ? new Date(visit.exited_at) : new Date()
  return Math.max(0, (end.getTime() - new Date(visit.entered_at).getTime()) / 60000)
}

function duration(visit: LocationVisit): string {
  const mins = minutes(visit)
  if (mins < 60) return `${Math.round(mins)}m`
  const hours = mins / 60
  if (hours < 24) return `${hours.toFixed(hours < 10 ? 1 : 0)}h`
  return `${Math.round(hours / 24)}d`
}

function when(visit: LocationVisit): string {
  return new Date(visit.entered_at).toLocaleString(undefined, {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  })
}

export function VisitsPanel() {
  const { row } = useFields([])
  const id = row.id as string | undefined
  const { data: visits, isPending } = useLocationVisits(id ?? null)

  if (row.latitude == null || row.longitude == null) return null

  const total = (visits ?? []).reduce((sum, v) => sum + minutes(v), 0)

  return (
    <section className="sm:col-span-2">
      <div className="mb-2 flex items-baseline justify-between">
        <h3 className="text-sm font-medium text-stone-700 dark:text-stone-200">Visits</h3>
        {visits && visits.length > 0 && (
          <span className="text-xs text-stone-500 dark:text-stone-400">
            {visits.length} · {(total / 60).toFixed(1)}h total
          </span>
        )}
      </div>

      {isPending ? (
        <p className="text-sm text-stone-500">Loading…</p>
      ) : !visits || visits.length === 0 ? (
        <p className="text-sm text-stone-500 dark:text-stone-400">
          Nothing yet. Visits are derived from location readings — if this fence is new,
          rebuild it to fill in history that already happened here.
        </p>
      ) : (
        <ul className="divide-y divide-stone-200 text-sm dark:divide-stone-700">
          {visits.map((visit) => (
            <li key={visit.id} className="flex items-baseline justify-between py-1.5">
              <span className="text-stone-700 dark:text-stone-200">{when(visit)}</span>
              <span className="flex items-baseline gap-2">
                {visit.exited_at === null && (
                  <span className="text-xs font-medium text-emerald-600 dark:text-emerald-400">
                    here now
                  </span>
                )}
                {/* A visit closed as `stale` ended because the readings stopped, not
                    because a departure was seen — so the end time is a lower bound. */}
                {visit.close_reason === "stale" && (
                  <span
                    className="text-xs text-amber-600 dark:text-amber-400"
                    title="Readings stopped; the end time is a lower bound"
                  >
                    ~
                  </span>
                )}
                <span className="tabular-nums text-stone-500 dark:text-stone-400">
                  {duration(visit)}
                </span>
              </span>
            </li>
          ))}
        </ul>
      )}
    </section>
  )
}
