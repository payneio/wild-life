import { useState } from "react"
import { QuickCreate } from "@/components/QuickCreate"
import { Input } from "@/components/ui/primitives"
import { localInputToInstant, nowInstant, today } from "@/lib/date"
import { events } from "@/services/api/hooks"
import type { EntityType } from "@/services/api/types"

/**
 * Recording that something happened, from the page of the thing it happened to.
 *
 * The calendar is where events get *scheduled*, and a drag there already says
 * when — so that capture asks only for a title (ui-architecture §2b rule 1).
 * From an object's panel the gesture says what it's *about* and nothing about
 * time, and what you are almost always doing is recording a past occurrence:
 * "took the fructose intolerance test", not "book one for Tuesday".
 *
 * So the date is asked for and defaults to today, the way a Delegation asks for
 * its person (§2b rule 4 — an event with no time isn't an event, any more than a
 * delegation with no one is a delegation). All-day, because "what day did that
 * happen" is the question and the clock time isn't the point.
 */
export function EventCapture({ root }: { root: { type: EntityType; id: string } }) {
  const create = events.useCreate()
  const [day, setDay] = useState<string>(() => today())

  return (
    <QuickCreate
      placeholder="What happened…"
      onCreate={(title) => {
        if (!day) return false
        create.mutate({
          title,
          start_at: localInputToInstant(`${day}T12:00`) ?? nowInstant(),
          all_day: true,
          entity_type: root.type,
          entity_id: root.id,
        })
      }}
      extra={
        <Input
          type="date"
          value={day}
          onChange={(e) => setDay(e.target.value)}
          className="w-auto shrink-0"
        />
      }
    />
  )
}
