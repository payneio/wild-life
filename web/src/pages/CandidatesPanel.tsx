import { Check, Sparkles, X } from "lucide-react"
import { useState } from "react"
import { useDismissCandidate, usePlaceCandidates, usePromoteCandidate } from "@/services/api/hooks"
import type { PlaceCandidate } from "@/services/api/types"

/**
 * Places the system noticed you keep returning to, before they have names.
 *
 * The gesture this panel exists for is Promote, and it follows the capture rule
 * (docs/ui-architecture.md §2b): the queue is a repeated flow, so it **stays
 * put** — the card leaves, the next one is ready, and the new place is one click
 * away rather than dragging you off the page.
 *
 * Only a name is asked for. Everything else the reverse-geocode prefills or the
 * detail view can refine later, and demanding a category up front would turn a
 * one-second decision into a form.
 */

function humanDwell(seconds: number): string {
  const hours = seconds / 3600
  if (hours < 1) return `${Math.round(seconds / 60)} min`
  if (hours < 48) return `${hours.toFixed(hours < 10 ? 1 : 0)} hours`
  return `${Math.round(hours / 24)} days`
}

function span(candidate: PlaceCandidate): string {
  const fmt = (iso: string) =>
    new Date(iso).toLocaleDateString(undefined, { month: "short", day: "numeric" })
  return `${fmt(candidate.first_seen_at)} – ${fmt(candidate.last_seen_at)}`
}

function CandidateCard({ candidate }: { candidate: PlaceCandidate }) {
  const [name, setName] = useState(candidate.label_hint ?? "")
  const promote = usePromoteCandidate()
  const dismiss = useDismissCandidate()
  const busy = promote.isPending || dismiss.isPending

  return (
    <li className="rounded-lg border border-stone-200 p-3 dark:border-stone-700">
      <div className="flex items-baseline justify-between gap-2 text-sm">
        <span className="font-medium">
          {candidate.stop_count} stops · {humanDwell(candidate.total_seconds)}
        </span>
        <span className="text-xs text-stone-500 dark:text-stone-400">{span(candidate)}</span>
      </div>
      <p className="mt-0.5 font-mono text-xs text-stone-500 dark:text-stone-400">
        {candidate.centroid_lat.toFixed(4)}, {candidate.centroid_lon.toFixed(4)} · ±
        {Math.round(candidate.radius_m)} m
      </p>

      <div className="mt-2 flex items-center gap-2">
        <input
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="Name this place…"
          className="min-w-0 flex-1 rounded border border-stone-300 px-2 py-1 text-sm dark:border-stone-600 dark:bg-stone-900"
          onKeyDown={(e) => {
            if (e.key === "Enter" && !busy) {
              promote.mutate({ id: candidate.id, name: name.trim() || undefined })
            }
          }}
        />
        <button
          onClick={() => promote.mutate({ id: candidate.id, name: name.trim() || undefined })}
          disabled={busy}
          title="Make this a location, and fill in the history it explains"
          className="rounded bg-teal-600 p-1.5 text-white hover:bg-teal-700 disabled:opacity-40"
        >
          <Check size={15} />
        </button>
        <button
          onClick={() => dismiss.mutate(candidate.id)}
          disabled={busy}
          title="Not a place"
          className="rounded p-1.5 text-stone-500 hover:bg-stone-100 disabled:opacity-40 dark:hover:bg-stone-800"
        >
          <X size={15} />
        </button>
      </div>

      {promote.isSuccess && (
        <p className="mt-1.5 text-xs text-teal-700 dark:text-teal-300">
          Added — {promote.data.visits} past{" "}
          {promote.data.visits === 1 ? "visit" : "visits"} filled in.
        </p>
      )}
    </li>
  )
}

export function CandidatesPanel() {
  const { data: candidates } = usePlaceCandidates()
  if (!candidates) return null

  return (
    <section className="rounded-lg border border-stone-200 p-3 dark:border-stone-700">
      <h2 className="mb-2 flex items-center gap-1.5 text-sm font-semibold">
        <Sparkles size={15} /> Places you keep going
        {candidates.length > 0 && (
          <span className="font-normal text-stone-500">({candidates.length})</span>
        )}
      </h2>
      {/* Rendering nothing when empty hides the feature from the one person who
          would benefit from knowing it is watching. Say what it is waiting for. */}
      {candidates.length === 0 ? (
        <p className="text-sm text-stone-500 dark:text-stone-400">
          Nothing to propose yet. Somewhere you stop repeatedly — three separate
          visits, or four hours in total — shows up here to be named, and naming it
          fills in the history you already have there. Recalculated overnight.
        </p>
      ) : (
        <ul className="space-y-2">
          {candidates.map((c) => (
            <CandidateCard key={c.id} candidate={c} />
          ))}
        </ul>
      )}
    </section>
  )
}
