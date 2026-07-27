import { ChevronLeft, ChevronRight, MapPinned, TriangleAlert } from "lucide-react"
import { lazy, Suspense, useMemo, useState } from "react"
import { Link } from "react-router-dom"
import { CandidatesPanel } from "@/pages/CandidatesPanel"
import { locations, useIngestStatus, useTrack, useVisitsBetween } from "@/services/api/hooks"
import type { Location, LocationVisit } from "@/services/api/types"

const TrackMap = lazy(() =>
  import("@/components/TrackMap").then((m) => ({ default: m.TrackMap })),
)

/**
 * Where I was — a day at a time.
 *
 * The bespoke visualization the object model earns for Location (spatiality ×
 * temporality; see docs/ui-architecture.md §5). The list is not flat on purpose:
 * fences nest, so an afternoon is simultaneously "Seattle", "Capitol Hill" and
 * "the office". Indenting by radius is what makes that legible rather than
 * looking like four contradictory answers.
 */

function dayBounds(day: Date): { from: string; to: string } {
  const start = new Date(day)
  start.setHours(0, 0, 0, 0)
  const end = new Date(start)
  end.setDate(end.getDate() + 1)
  return { from: start.toISOString(), to: end.toISOString() }
}

function clockRange(visit: LocationVisit, from: string, to: string): string {
  const fmt = (iso: string) =>
    new Date(iso).toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" })
  // A visit can run past either end of the day being viewed; show that rather
  // than pretending it started at midnight.
  const startedEarlier = visit.entered_at < from
  const start = startedEarlier ? "…" : fmt(visit.entered_at)
  if (visit.exited_at === null) return `${start} – now`
  const end = visit.exited_at > to ? "…" : fmt(visit.exited_at)
  return `${start} – ${end}`
}

function durationOf(visit: LocationVisit): string {
  const end = visit.exited_at ? new Date(visit.exited_at) : new Date()
  const mins = Math.max(0, (end.getTime() - new Date(visit.entered_at).getTime()) / 60000)
  if (mins < 60) return `${Math.round(mins)}m`
  const hours = mins / 60
  return hours < 24 ? `${hours.toFixed(1)}h` : `${Math.round(hours / 24)}d`
}

function hoursSince(moment: Date | null): number {
  return moment ? (new Date().getTime() - moment.getTime()) / 3_600_000 : Infinity
}

function StatusBanner() {
  const { data } = useIngestStatus()
  if (!data) return null

  if (data.total_readings === 0) {
    return (
      <p className="rounded-lg bg-stone-100 px-3 py-2 text-sm text-stone-600 dark:bg-stone-800 dark:text-stone-300">
        No readings yet. Location history comes from a tracker app on your phone
        posting to this API.
      </p>
    )
  }

  const last = data.last_recorded_at ? new Date(data.last_recorded_at) : null
  const hoursAgo = hoursSince(last)
  // The feature's real failure mode is silence: a tracker that stopped looks
  // exactly like a quiet day. Say so once it has been quiet implausibly long.
  if (hoursAgo > 12) {
    return (
      <p className="flex items-center gap-2 rounded-lg bg-amber-50 px-3 py-2 text-sm text-amber-800 dark:bg-amber-950/40 dark:text-amber-200">
        <TriangleAlert size={15} />
        No readings for {Math.round(hoursAgo)}h — the tracker may have stopped running.
      </p>
    )
  }
  return (
    <p className="text-xs text-stone-500 dark:text-stone-400">
      {data.readings_24h} readings in the last 24h · latest {last?.toLocaleTimeString()}
      {data.device_id ? ` from ${data.device_id}` : ""}
    </p>
  )
}

export function PlacesPage() {
  const [day, setDay] = useState(() => new Date())
  const { from, to } = useMemo(() => dayBounds(day), [day])

  const { data: visits } = useVisitsBetween(from, to)
  const { data: points } = useTrack(from, to)
  const { data: allLocations } = locations.useList()

  const byId = useMemo(() => {
    const map = new Map<string, Location>()
    for (const l of allLocations ?? []) map.set(l.id, l)
    return map
  }, [allLocations])

  // Widest first, so containment reads top-down: the city, then the
  // neighbourhood inside it, then the building.
  const ordered = useMemo(() => {
    return [...(visits ?? [])].sort((a, b) => {
      const ra = byId.get(a.location_id)?.radius_m ?? 0
      const rb = byId.get(b.location_id)?.radius_m ?? 0
      if (rb !== ra) return rb - ra
      return a.entered_at.localeCompare(b.entered_at)
    })
  }, [visits, byId])

  const fencesInView = useMemo(
    () =>
      (allLocations ?? []).filter((l) =>
        (visits ?? []).some((v) => v.location_id === l.id),
      ),
    [allLocations, visits],
  )

  const shift = (days: number) => {
    const next = new Date(day)
    next.setDate(next.getDate() + days)
    setDay(next)
  }
  const isToday = new Date().toDateString() === day.toDateString()

  return (
    <div className="mx-auto max-w-6xl space-y-4 p-4">
      <header className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="flex items-center gap-2 text-xl font-semibold">
            <MapPinned size={20} /> Places
          </h1>
          <p className="text-sm text-stone-500 dark:text-stone-400">Where you were</p>
        </div>
        <div className="flex items-center gap-1">
          <button
            onClick={() => shift(-1)}
            aria-label="Previous day"
            className="rounded p-1.5 hover:bg-stone-100 dark:hover:bg-stone-800"
          >
            <ChevronLeft size={18} />
          </button>
          <span className="min-w-40 text-center text-sm font-medium">
            {day.toLocaleDateString(undefined, {
              weekday: "short",
              month: "short",
              day: "numeric",
            })}
          </span>
          <button
            onClick={() => shift(1)}
            disabled={isToday}
            aria-label="Next day"
            className="rounded p-1.5 hover:bg-stone-100 disabled:opacity-30 dark:hover:bg-stone-800"
          >
            <ChevronRight size={18} />
          </button>
        </div>
      </header>

      <StatusBanner />
      <CandidatesPanel />

      <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.2fr)]">
        <section className="space-y-1">
          {ordered.length === 0 ? (
            <p className="rounded-lg border border-dashed border-stone-300 p-6 text-center text-sm text-stone-500 dark:border-stone-700 dark:text-stone-400">
              No visits this day. Visits appear where readings fall inside a location's
              fence — give a location coordinates to start matching.
            </p>
          ) : (
            ordered.map((visit, i) => {
              const place = byId.get(visit.location_id)
              // Indent by rank, not by radius, so nesting is visible without the
              // widest fence pushing everything off the left edge.
              const depth = Math.min(i, 4)
              return (
                <div
                  key={visit.id}
                  className="flex items-baseline justify-between gap-3 rounded border-l-2 border-teal-500/40 bg-stone-50 py-1.5 pr-3 text-sm dark:bg-stone-900"
                  style={{ marginLeft: depth * 14 }}
                >
                  <Link
                    to={`/locations/${visit.location_id}`}
                    className="truncate pl-2 font-medium hover:underline"
                  >
                    {place?.name ?? "Unknown place"}
                  </Link>
                  <span className="flex shrink-0 items-baseline gap-2 text-xs text-stone-500 dark:text-stone-400">
                    <span className="tabular-nums">{clockRange(visit, from, to)}</span>
                    {/* `stale` means the readings stopped rather than a departure
                        being seen, so the end is a lower bound, not a fact. */}
                    {visit.close_reason === "stale" && (
                      <span
                        className="text-amber-600 dark:text-amber-400"
                        title="Readings stopped; the end time is a lower bound"
                      >
                        ~
                      </span>
                    )}
                    <span className="tabular-nums font-medium">{durationOf(visit)}</span>
                  </span>
                </div>
              )
            })
          )}
        </section>

        <Suspense
          fallback={
            <div className="h-[420px] animate-pulse rounded-lg bg-stone-100 dark:bg-stone-800" />
          }
        >
          <TrackMap points={points ?? []} fences={fencesInView} />
        </Suspense>
      </div>
    </div>
  )
}
