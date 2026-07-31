import { describe, expect, it } from "vitest"
import { LIFECYCLE } from "@/services/api/lifecycle.gen"
import { byLifecycle, isTerminal, rowIsTerminal } from "@/services/api/lifecycle"
import { REGISTRY } from "@/services/api/registry"
import { FIXTURES } from "@/test/fixtures"

/**
 * The completeness guarantee for the lifecycle table, in the same spirit as
 * `entities/coverage.test.tsx`: driven from the registry and the fixtures rather
 * than a hand-kept list, so adding a status-bearing entity enrols it here
 * automatically.
 *
 * The compile-time `Record<XStatus, LifecyclePhase>` assertion in `lifecycle.ts`
 * catches a *new status* on a type the table already knows. This catches the case
 * it can't see: a brand-new entity type that has a status column and no entry at
 * all — which would silently report "open" for every row and leak finished
 * records back into every picker.
 */
const statusBearing = Object.values(REGISTRY).filter(
  (d) => d.entityType && FIXTURES[d.key] && "status" in FIXTURES[d.key],
)

describe("lifecycle coverage", () => {
  it("finds status-bearing entities to check", () => {
    expect(statusBearing.length).toBeGreaterThan(0)
  })

  it.each(statusBearing.map((d) => [d.key, d.entityType!] as const))(
    "%s is classified in the lifecycle table",
    (key, entityType) => {
      expect(
        LIFECYCLE[entityType as keyof typeof LIFECYCLE],
        `"${key}" has a status column but no lifecycle entry. Add one to ` +
          `api/src/wild_life/lifecycle.py and re-run \`pnpm gen:api\`.`,
      ).toBeDefined()
    },
  )
})

describe("isTerminal", () => {
  it("reads the generated table", () => {
    expect(isTerminal("project", "completed")).toBe(true)
    expect(isTerminal("project", "archived")).toBe(true)
    expect(isTerminal("project", "active")).toBe(false)
    expect(isTerminal("project", "proposed")).toBe(false)
    // Paused/waiting are blocked, not finished — still assignable.
    expect(isTerminal("project", "paused")).toBe(false)
    expect(isTerminal("task", "completed")).toBe(true)
    expect(isTerminal("outcome", "dropped")).toBe(true)
  })

  it("treats dormant as open", () => {
    // You still file work under a quiet area or an inactive org.
    expect(isTerminal("area", "inactive")).toBe(false)
    expect(isTerminal("area", "archived")).toBe(true)
    expect(isTerminal("organization", "inactive")).toBe(false)
  })

  it("reports open for types with no status, and for unknown statuses", () => {
    // Absence of a terminal status is not evidence of one.
    expect(isTerminal("person", undefined)).toBe(false)
    // Types with no status column at all. `note` and `event` used to stand here
    // and are gone — an entity type that cannot be constructed should not be
    // nameable, which is why removing them from the union broke this line.
    expect(isTerminal("moment", undefined)).toBe(false)
    expect(isTerminal("location", "cancelled")).toBe(false)
    expect(isTerminal("project", "bogus")).toBe(false)
    expect(isTerminal("project", null)).toBe(false)
  })

  it("reads a whole row", () => {
    expect(rowIsTerminal("project", { status: "completed" })).toBe(true)
    expect(rowIsTerminal("project", { status: "active" })).toBe(false)
    expect(rowIsTerminal("project", null)).toBe(false)
  })
})

describe("byLifecycle", () => {
  const order = (type: Parameters<typeof byLifecycle>[0], statuses: string[]) =>
    byLifecycle(
      type,
      statuses.map((status, i) => ({ status, i })),
    ).map((r) => r.status)

  it("puts live work first and finished work last", () => {
    expect(order("project", ["archived", "proposed", "active"])).toEqual([
      "active",
      "proposed",
      "archived",
    ])
    expect(order("program", ["cancelled", "resolved", "proposed", "monitoring"])).toEqual([
      "monitoring",
      "proposed",
      "resolved",
      "cancelled",
    ])
  })

  it("keeps stalled work with the living, ahead of what hasn't started", () => {
    expect(order("project", ["proposed", "paused", "waiting"])).toEqual([
      "paused",
      "waiting",
      "proposed",
    ])
  })

  it("is stable, so the caller's order survives inside a phase", () => {
    const rows = [
      { status: "active", i: 0 },
      { status: "completed", i: 1 },
      { status: "active", i: 2 },
    ]
    expect(byLifecycle("project", rows).map((r) => r.i)).toEqual([0, 2, 1])
    expect(rows.map((r) => r.i)).toEqual([0, 1, 2]) // copies rather than sorting in place
  })

  it("leaves rows with no status alone", () => {
    expect(byLifecycle("moment", [{ id: "b" }, { id: "a" }]).map((r) => r.id)).toEqual(["b", "a"])
  })
})
