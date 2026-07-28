import { describe, expect, it } from "vitest"
import { REGISTRY } from "@/services/api/registry"

describe("the program's relations", () => {
  it("declares no Events panel, because the Log band is its history", () => {
    // Both at once is what shipped: the IMO page drew its 21 events in a
    // Timeline band and again in an `Events · 21` panel five panels down, which
    // is where the capture had been sitting unfound. That band is now the Log
    // every record carries — one dated sequence per object, so there is nothing
    // left to choose between and nothing to declare here.
    const relations = REGISTRY.program.relations ?? []
    expect(relations.map((r) => r.type)).not.toContain("event")
  })

  it("has no bespoke timeline left to drift from the Log", async () => {
    const planning = await import("@/components/detail/planning")
    expect("ProgramTimeline" in planning).toBe(false)
  })
})
