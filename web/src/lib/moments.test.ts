// Run with `pnpm test` (pins TZ=America/Los_Angeles), so "evening" below really
// is an evening west of Greenwich and the assertions are deterministic.
import { describe, it, expect } from "vitest"
import { groupMomentsByDay } from "./moments"
import type { Instant } from "@/lib/date"
import type { Moment } from "@/services/api/types"

const at = (started: string): Moment =>
  ({
    id: started,
    kind: "dose",
    started_at: started as Instant,
    window_start: null,
    created_at: started as Instant,
    links: [],
  }) as unknown as Moment

describe("groupMomentsByDay", () => {
  // The timeline sliced the day off the timestamp instead, which is the UTC
  // day: every dose taken after 5pm Pacific jumped to the following morning.
  it("buckets by the local day, not the UTC one", () => {
    const evening = at("2026-07-29T22:30:00-07:00") // 05:30Z on the 30th
    const [group, ...rest] = groupMomentsByDay([evening])
    expect(group.key).toBe("2026-07-29")
    expect(rest).toEqual([])
  })

  it("keeps a local day together across the UTC midnight inside it", () => {
    const groups = groupMomentsByDay([
      at("2026-07-29T23:00:00-07:00"),
      at("2026-07-29T09:00:00-07:00"),
    ])
    expect(groups.map((g) => g.key)).toEqual(["2026-07-29"])
    expect(groups[0].moments).toHaveLength(2)
  })
})
