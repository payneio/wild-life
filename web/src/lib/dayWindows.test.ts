// Every bug this file guards against had the same shape: a *local* day pinned to
// a *UTC* clock. `pnpm test` pins one zone, and one zone only ever catches one
// sign of the error — west of Greenwich the window opens too early, east of it
// too late — so these run the same invariants at both, plus UTC where the bug is
// invisible by construction.
//
// The assertions are properties rather than golden strings: a window must
// contain the day it names and nothing else. That holds at any offset, across
// both DST transitions, and it is what every fixed call site actually needed.
import { afterEach, describe, expect, it, vi } from "vitest"
import {
  addDays,
  asInstant,
  compareInstants,
  dayOf,
  endOfDay,
  localInputToInstant,
  startOfDay,
  type CalendarDay,
  type Instant,
} from "./date"

const day = (s: string) => s as CalendarDay

const ZONES = ["America/Los_Angeles", "Asia/Tokyo", "UTC"]

afterEach(() => vi.unstubAllEnvs())

/** Run `fn` as if the device were in `zone`. Temporal reads the ambient zone at
 *  call time, so moving TZ really does move the observer.
 *
 *  `vi.stubEnv` rather than assigning `process.env.TZ` directly: restoring by
 *  assignment writes the *string* "undefined" whenever TZ was unset, which is a
 *  zone resolving to nothing that then poisons every later test. `pnpm test`
 *  always sets TZ so that never bites there; running `vitest` directly, it does. */
function inZone<T>(zone: string, fn: () => T): T {
  vi.stubEnv("TZ", zone)
  try {
    return fn()
  } finally {
    vi.unstubAllEnvs()
  }
}

// If `inZone` ever stops moving the observer — a Node or polyfill change that
// caches the ambient zone — every case below silently collapses to the one zone
// `pnpm test` pins, and a suite that covers nothing still passes. So prove the
// mechanism works before relying on it.
describe("inZone", () => {
  it("actually moves the observer", () => {
    const at = "2026-07-31T05:00:00Z" as Instant
    expect(inZone("America/Los_Angeles", () => dayOf(at))).toBe("2026-07-30")
    expect(inZone("Asia/Tokyo", () => dayOf(at))).toBe("2026-07-31")
  })
  it("restores the ambient zone afterwards", () => {
    const at = "2026-07-31T05:00:00Z" as Instant
    const before = dayOf(at)
    inZone("Asia/Tokyo", () => undefined)
    expect(dayOf(at)).toBe(before)
  })
})

// Days chosen to include both US DST transitions: 2026-03-08 is 23 hours long in
// Los Angeles and 2026-11-01 is 25, so a window built by adding 86,400,000ms
// lands in the wrong day on exactly these two.
const DAYS = ["2026-01-01", "2026-03-08", "2026-07-30", "2026-11-01", "2026-12-31"]

describe.each(ZONES)("day windows in %s", (zone) => {
  it.each(DAYS)("the window for %s falls on that day at both ends", (d) => {
    inZone(zone, () => {
      expect(dayOf(startOfDay(day(d)))).toBe(d)
      expect(dayOf(endOfDay(day(d)))).toBe(d)
    })
  })

  it.each(DAYS)("%s: every hour of the local day is inside its window", (d) => {
    inZone(zone, () => {
      const from = startOfDay(day(d))
      const to = endOfDay(day(d))
      // 03:00 rather than 02:00 as the early sample: 02:30 does not exist on a
      // spring-forward morning, and the point here is the window, not
      // disambiguation.
      for (const clock of ["00:00", "03:00", "12:00", "17:30", "22:00", "23:59"]) {
        const at = localInputToInstant(`${d}T${clock}`)!
        expect(
          compareInstants(at, from) >= 0 && compareInstants(at, to) <= 0,
          `${d}T${clock} in ${zone} fell outside its own day's window`,
        ).toBe(true)
      }
    })
  })

  it.each(DAYS)("%s: consecutive windows neither overlap nor leave a gap", (d) => {
    inZone(zone, () => {
      const closes = endOfDay(day(d))
      const opens = startOfDay(addDays(day(d), 1))
      expect(compareInstants(closes, opens)).toBeLessThan(0)
      // endOfDay is the day's last instant, not the next day's first, because
      // the API's `until` is inclusive. The seam is therefore 1ms, not 0.
      expect(new Date(opens).getTime() - new Date(closes).getTime()).toBe(1)
    })
  })

  it("a year window contains a late-evening 31 December", () => {
    inZone(zone, () => {
      const from = startOfDay(day("2026-01-01"))
      const to = endOfDay(day("2026-12-31"))
      const nye = localInputToInstant("2026-12-31T23:00")!
      expect(compareInstants(nye, to)).toBeLessThanOrEqual(0)
      expect(compareInstants(nye, from)).toBeGreaterThan(0)
    })
  })
})

describe("the regression these replaced", () => {
  it("a UTC-stamped day window drops the evening it claims to cover", () => {
    // What TodayPage did: build `${today}T00:00:00.000Z` … `${today}T23:59:59.999Z`
    // from a *local* today. In Los Angeles that window shuts at 16:59 local, so a
    // 10pm dose is not in "today" at all. Kept as an executable statement of the
    // bug, so the fix cannot be quietly reverted to something that looks similar.
    inZone("America/Los_Angeles", () => {
      const d = day("2026-07-30")
      const evening = localInputToInstant(`${d}T22:00`)!

      const utcEnd = `${d}T23:59:59.999Z` as Instant
      expect(compareInstants(evening, utcEnd)).toBeGreaterThan(0) // outside — the bug

      expect(compareInstants(evening, endOfDay(d))).toBeLessThanOrEqual(0) // inside — the fix
    })
  })
})

describe("asInstant — the boundary assertion", () => {
  it("accepts a real instant and normalises it", () => {
    expect(asInstant("2026-07-30T22:00:00-07:00")).toBe("2026-07-31T05:00:00Z")
  })
  it("refuses a bare day, a truncated stamp and junk", () => {
    for (const bad of ["2026-07-30", "2026-07-30T22:00", "", "nonsense", null, undefined])
      expect(asInstant(bad)).toBeNull()
  })
})
