import { describe, expect, it } from "vitest"
import { REGISTRY } from "@/services/api/registry"
import { FIXTURES } from "@/test/fixtures"

/**
 * A relation panel filters by a field on the target. If that field doesn't exist
 * — because a column was renamed or re-rooted — the API's generic query layer
 * *silently ignores* the unknown param and returns the whole table. The panel
 * then looks full of data rather than broken: an Area's Metrics panel listed
 * every metric in the app, blood pressure included, because it still filtered on
 * `area_id` after Metric moved to a soft-poly root.
 *
 * Silence is the problem, so this makes it loud at build time.
 */
describe("every fk-children panel filters on a field the target actually has", () => {
  const specs = Object.values(REGISTRY).flatMap((def) =>
    (def.relations ?? [])
      .filter((r) => r.mode === "fk-children")
      .map((r) => ({ parent: def.key, ...(r as { label: string; type: string; fkField: string }) })),
  )

  it("has panels to check", () => {
    expect(specs.length).toBeGreaterThan(0)
  })

  it.each(specs.map((s) => [`${s.parent} → ${s.label}`, s] as const))(
    "%s",
    (_name, spec) => {
      const targetDef = Object.values(REGISTRY).find((d) => d.entityType === spec.type)
      const fixture = FIXTURES[targetDef?.key ?? spec.type]
      // No fixture means the target isn't covered here; the coverage suite owns that.
      if (!fixture) return
      expect(
        Object.keys(fixture),
        `${spec.parent}'s "${spec.label}" panel filters ${spec.type} by "${spec.fkField}", which no longer exists`,
      ).toContain(spec.fkField)
    },
  )
})
