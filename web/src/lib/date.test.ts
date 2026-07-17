// Run with `pnpm test` (pins TZ=America/Los_Angeles so the local-day assertions
// are deterministic). These lock in the behavior that the branded types make
// unrepresentable to get wrong — the whole point of the date module.
import { describe, it, expect } from "vitest"
import {
  addDays,
  asDay,
  compareDays,
  dayLabel,
  dayOf,
  daysBetween,
  formatDay,
  formatInstant,
  instantToLocalInput,
  isPast,
  isToday,
  localInputToInstant,
  rruleDtstart,
  today,
  type CalendarDay,
  type Instant,
} from "./date"

const inst = (s: string) => s as Instant
const day = (s: string) => s as CalendarDay

describe("dayOf — the bug this whole module exists to kill", () => {
  it("an evening instant belongs to the LOCAL day, not the next UTC day", () => {
    // 2026-07-17T04:00Z === 2026-07-16 9:00pm Pacific
    expect(dayOf(inst("2026-07-17T04:00:00Z"))).toBe("2026-07-16")
  })
  it("a daytime instant stays on the same day", () => {
    // 2026-07-17T20:00Z === 2026-07-17 1:00pm Pacific
    expect(dayOf(inst("2026-07-17T20:00:00Z"))).toBe("2026-07-17")
  })
})

describe("asDay", () => {
  it("passes a bare date through unchanged", () => {
    expect(asDay("2026-07-16")).toBe("2026-07-16")
  })
  it("converts a timestamp to the local day", () => {
    expect(asDay("2026-07-17T04:00:00Z")).toBe("2026-07-16")
  })
})

describe("arithmetic (calendar days — no timezone/DST hazard)", () => {
  it("addDays crosses a month boundary", () => {
    expect(addDays(day("2026-07-30"), 5)).toBe("2026-08-04")
  })
  it("addDays is unaffected by a DST transition", () => {
    // US DST ends 2026-11-01; calendar +1 is still just the next date
    expect(addDays(day("2026-10-31"), 1)).toBe("2026-11-01")
    expect(addDays(day("2026-11-01"), 1)).toBe("2026-11-02")
  })
  it("addDays goes backward", () => {
    expect(addDays(day("2026-01-01"), -1)).toBe("2025-12-31")
  })
  it("daysBetween is signed", () => {
    expect(daysBetween(day("2026-07-16"), day("2026-07-20"))).toBe(4)
    expect(daysBetween(day("2026-07-20"), day("2026-07-16"))).toBe(-4)
  })
  it("compareDays orders days", () => {
    expect(compareDays(day("2026-07-16"), day("2026-07-17"))).toBeLessThan(0)
    expect(compareDays(day("2026-07-17"), day("2026-07-17"))).toBe(0)
  })
})

describe("today-relative", () => {
  it("today() counts as today and is not past", () => {
    expect(isToday(today())).toBe(true)
    expect(isPast(today())).toBe(false)
  })
  it("yesterday is past, tomorrow is not", () => {
    expect(isPast(addDays(today(), -1))).toBe(true)
    expect(isPast(addDays(today(), 1))).toBe(false)
  })
})

describe("form round-trip (datetime-local widget)", () => {
  it("instant → local input → instant is lossless at minute precision", () => {
    const i = inst("2026-07-17T04:30:00Z")
    const local = instantToLocalInput(i)
    expect(local).toBe("2026-07-16T21:30")
    expect(localInputToInstant(local)).toBe("2026-07-17T04:30:00Z")
  })
})

describe("rruleDtstart", () => {
  it("produces the RFC-5545 basic-UTC stamp", () => {
    expect(rruleDtstart(inst("2026-07-17T04:00:00Z"))).toBe("20260717T040000Z")
  })
})

describe("labels & formatting", () => {
  it("dayLabel says Today / Yesterday", () => {
    expect(dayLabel(today())).toBe("Today")
    expect(dayLabel(addDays(today(), -1))).toBe("Yesterday")
  })
  it("formatDay / formatInstant return non-empty strings and never throw", () => {
    expect(formatDay(day("2026-07-16"))).toBeTruthy()
    expect(formatInstant(inst("2026-07-17T04:00:00Z"))).toBeTruthy()
    expect(formatDay(null)).toBe("")
    expect(formatInstant(undefined)).toBe("")
  })
})
