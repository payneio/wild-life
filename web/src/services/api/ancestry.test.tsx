import { renderHook } from "@testing-library/react"
import { describe, expect, it, vi } from "vitest"
import { REGISTRY } from "@/services/api/registry"
import { FIXTURES } from "@/test/fixtures"

const ROWS: Record<string, Record<string, unknown>> = {
  "area:a1": { id: "a1", name: "Health" },
  "program:g1": { id: "g1", name: "Sleep", area_id: "a1" },
  "project:p1": { id: "p1", name: "Sleep study", program_id: "g1" },
  "task:t1": { id: "t1", title: "Book the clinic", scope_type: "project", scope_id: "p1" },
  // A task filed straight at an area, which the model still allows.
  "task:t2": { id: "t2", title: "Clean the flat", scope_type: "area", scope_id: "a1" },
  // An unfiled inbox capture: no parent at all.
  "task:t3": { id: "t3", title: "Write the article" },
}

vi.mock("@/services/api/mentions", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/services/api/mentions")>()),
  useEntityRow: () => (type: string, id: string) => ROWS[`${type}:${id}`],
}))

const { useAncestry } = await import("@/services/api/ancestry")

const trail = (type: string, id: string) =>
  renderHook(() => useAncestry(type as never, id))
    .result.current.map((c) => `${c.type}:${c.label}`)

describe("useAncestry", () => {
  it("reaches the area a project never stored", () => {
    // The whole point: `projects` has no area_id column. The area is two links
    // away and arrives by asking the program, so it cannot be stale.
    expect(trail("project", "p1")).toEqual(["area:Health", "program:Sleep"])
  })

  it("walks every rung from the bottom", () => {
    expect(trail("task", "t1")).toEqual([
      "area:Health",
      "program:Sleep",
      "project:Sleep study",
    ])
  })

  it("starts from whichever rung the object actually hangs from", () => {
    expect(trail("task", "t2")).toEqual(["area:Health"])
  })

  it("is empty for something filed nowhere", () => {
    // An inbox capture has no trail — and must not render an empty crumb rail.
    expect(trail("task", "t3")).toEqual([])
  })

  it("keeps a rung whose row hasn't loaded, unlabelled", () => {
    // Truncating instead would make the trail change shape as lists resolve.
    ROWS["project:p9"] = { id: "p9", name: "Orphan", program_id: "not-loaded" }
    const crumbs = renderHook(() => useAncestry("project", "p9")).result.current
    expect(crumbs).toEqual([{ type: "program", id: "not-loaded", label: undefined }])
    delete ROWS["project:p9"]
  })

  it("stops on a cycle rather than hanging", () => {
    ROWS["outcome:o1"] = { id: "o1", entity_type: "outcome", entity_id: "o2" }
    ROWS["outcome:o2"] = { id: "o2", entity_type: "outcome", entity_id: "o1" }
    expect(renderHook(() => useAncestry("outcome", "o1")).result.current.length)
      .toBeLessThanOrEqual(2)
    delete ROWS["outcome:o1"]
    delete ROWS["outcome:o2"]
  })
})

/**
 * The same failure mode `registry.test.ts` guards for panels, one facet over.
 *
 * `parent` reads fields off a row. When a column moves — Metric's root became a
 * soft-poly pair years ago — a declaration still naming the old one doesn't
 * throw; it reads `undefined` and the object silently loses its breadcrumb and
 * its picker subtitle. Metric was in exactly that state when this was written.
 *
 * Recording which keys the declaration touches catches it, because a key that no
 * longer exists is not a key the fixture has.
 */
describe("every parent reads fields the object actually has", () => {
  const withParent = Object.values(REGISTRY).filter((d) => d.parent)

  it("has parents to check", () => {
    expect(withParent.length).toBeGreaterThan(0)
  })

  it.each(withParent.map((d) => [d.key, d] as const))("%s", (key, def) => {
    const fixture = FIXTURES[key]
    // No fixture means the type isn't covered here; the coverage suite owns that.
    if (!fixture) return
    const read = new Set<string>()
    const row = fixture as unknown as Record<string, unknown>
    const spy = new Proxy(row, {
      get(target, prop) {
        if (typeof prop !== "string") return undefined
        read.add(prop)
        return target[prop]
      },
    })
    def.parent!(spy)
    expect(read.size, `${key}'s parent read no fields at all`).toBeGreaterThan(0)
    for (const field of read) {
      expect(
        Object.keys(fixture),
        `${key}'s parent reads "${field}", which the object no longer has`,
      ).toContain(field)
    }
  })
})
