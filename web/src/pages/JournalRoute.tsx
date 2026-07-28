import { Log } from "@/components/Log"

/**
 * The Journal: writing turned inward, framed as a landing surface.
 *
 * Defined **positively, by kind** — `reflection` — and not by what it lacks. It
 * used to be the self Person's log, which was already an improvement on "notes
 * carrying no tag", but it still routed the whole 29-year archive through a
 * subject link asserting that I was present at my own life. The self is the
 * frame, not a subject: 325 such links were deleted in the backfill, and the 253
 * self-rooted notes became reflections with no subject at all.
 *
 * So this is the ordinary Log component scoped by kind rather than by link, and
 * it needs no identity to render.
 */
export function JournalRoute() {
  return (
    <div className="mx-auto max-w-4xl">
      <Log kind="reflection" heading="Journal" base="/notes" deepLink />
    </div>
  )
}
