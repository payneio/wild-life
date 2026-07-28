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
 *
 * `readOnly` panels are exempt, and only they: their param is answered by a join
 * the API performs rather than a column on the row (an Area's Projects reach it
 * through the programs). The exemption is safe because the same silence cannot
 * happen there — an unrecognised param on those endpoints is an explicit 422,
 * not an ignored filter — and it is narrow because a read-only panel has no Add
 * to write the field back with.
 */
describe("every fk-children panel filters on a field the target actually has", () => {
  const specs = Object.values(REGISTRY).flatMap((def) =>
    (def.relations ?? [])
      .filter((r) => r.mode === "fk-children" && !r.readOnly)
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

/**
 * The same silence, from the other direction.
 *
 * `listParams` scopes an object to the rows of a shared table it actually *is*.
 * `routines` holds every rule — doses, activities, and 58 recurring calendar
 * series — and the mention picker lists a registry object by calling its crud
 * with no params. Before this it offered every synced meeting as a "Routine".
 *
 * A wrong field here fails the same silent way a relation panel does: the API's
 * query layer ignores an unknown param and returns the whole table, so the
 * picker looks populated rather than broken.
 */
describe("every listParams filter names a field the object actually has", () => {
  const scoped = Object.values(REGISTRY).filter((d) => d.listParams)

  it("has scopes to check", () => {
    expect(scoped.length).toBeGreaterThan(0)
  })

  it.each(scoped.map((d) => d.key))("%s", (key) => {
    const def = REGISTRY[key]
    const fixture = FIXTURES[key] as unknown as Record<string, unknown> | undefined
    expect(fixture, `no fixture for "${key}"`).toBeDefined()
    for (const param of Object.keys(def.listParams!)) {
      if (param === "limit" || param === "offset" || param === "sort") continue
      const field = param.split("__")[0]
      expect(
        Object.prototype.hasOwnProperty.call(fixture!, field),
        `${key}.listParams filters on "${field}", which ${key} does not carry`,
      ).toBe(true)
    }
  })
})
