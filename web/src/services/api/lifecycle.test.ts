import { describe, expect, it } from "vitest"
import { LIFECYCLE } from "@/services/api/lifecycle.gen"
import { isTerminal, rowIsTerminal } from "@/services/api/lifecycle"
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
    expect(isTerminal("note", undefined)).toBe(false)
    expect(isTerminal("event", "cancelled")).toBe(false) // no status column
    expect(isTerminal("project", "bogus")).toBe(false)
    expect(isTerminal("project", null)).toBe(false)
  })

  it("reads a whole row", () => {
    expect(rowIsTerminal("project", { status: "completed" })).toBe(true)
    expect(rowIsTerminal("project", { status: "active" })).toBe(false)
    expect(rowIsTerminal("project", null)).toBe(false)
  })
})
