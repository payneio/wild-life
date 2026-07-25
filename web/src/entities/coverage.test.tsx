import { render } from "@testing-library/react"
import { QueryClient, QueryClientProvider } from "@tanstack/react-query"
import { MemoryRouter } from "react-router-dom"
import { afterEach, describe, expect, it, vi } from "vitest"
import { setCoverageListener } from "@/components/record/context"
import { REGISTRY } from "@/services/api/registry"
import { FIXTURES } from "@/test/fixtures"
import type { Entity } from "@/services/api/types"

vi.mock("@/notes/floatingNoteContext", () => ({
  useFloatingNote: () => ({ openNote: vi.fn() }),
}))

/**
 * The completeness guarantee for hand-composed layouts.
 *
 * The generic renderer these replace was exhaustive by construction — it walked
 * every FieldSpec — so it could not drop a field. A written layout can, and an
 * unrendered field is data you can neither see nor edit: a worse failure than
 * the duplicate controls this refactor removes.
 *
 * So: mount each converted entity's *real* detail component against a complete
 * fixture and assert that every key either rendered or was explicitly excused.
 * Nothing here restates the layout, so this cannot drift from it. Converting an
 * entity automatically enrols it.
 */

function mount(ui: React.ReactNode) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  return render(
    <QueryClientProvider client={qc}>
      <MemoryRouter>{ui}</MemoryRouter>
    </QueryClientProvider>,
  )
}

const converted = Object.values(REGISTRY).filter((d) => d.detail)

afterEach(() => setCoverageListener(null))

describe("record layout coverage", () => {
  it("has at least one converted entity", () => {
    expect(converted.length).toBeGreaterThan(0)
  })

  it.each(converted.map((d) => d.key))("%s: every field renders or is excused", (key) => {
    const def = REGISTRY[key]
    const fixture = FIXTURES[key]
    expect(fixture, `no fixture for converted entity "${key}" — add one to test/fixtures.ts`).toBeDefined()

    const seen: Record<string, string[]> = {}
    setCoverageListener((k, missing) => (seen[k] = missing))

    const Detail = def.detail!
    mount(<Detail entity={fixture as Entity} onClose={() => {}} />)

    expect(seen[key], `"${key}" reported no coverage — is it wrapped in <Record>?`).toBeDefined()
    expect(seen[key]).toEqual([])
  })
})
