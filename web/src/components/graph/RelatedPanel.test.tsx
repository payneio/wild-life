import { render, screen } from "@testing-library/react"
import { QueryClient, QueryClientProvider } from "@tanstack/react-query"
import { MemoryRouter } from "react-router-dom"
import { describe, expect, it, vi } from "vitest"
import { RelatedPanel } from "@/components/graph/RelatedPanel"
import type { EntityDef, RelationSpec } from "@/services/api/registry"
import type { Entity } from "@/services/api/types"

vi.mock("@/notes/floatingNoteContext", () => ({
  useFloatingNote: () => ({ openNote: vi.fn() }),
}))

/**
 * `involves` decides whether an *empty* panel is offered. It must never decide
 * whether data is visible.
 *
 * Turning Medications off on a program that has medications would otherwise make
 * them unreachable — the same failure `entities/coverage.test.tsx` guards against
 * for fields, one level up.
 */
const SPEC: RelationSpec = {
  mode: "fk-children",
  label: "Medications",
  type: "medication",
  fkField: "program_id",
  hideWhenEmpty: true,
}

function defWith(rows: { id: string; name: string }[]): EntityDef {
  return {
    key: "medication",
    label: "Medication",
    crud: {
      useList: () => ({ data: rows }),
      useUpdate: () => ({ mutate: vi.fn() }),
      useCreate: () => ({ mutate: vi.fn() }),
    },
    fields: [],
    title: (e: Entity) => (e as unknown as { name: string }).name,
  } as unknown as EntityDef
}

function mount(parent: Record<string, unknown>, rows: { id: string; name: string }[]) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  return render(
    <QueryClientProvider client={qc}>
      <MemoryRouter>
        <RelatedPanel
          parent={parent as unknown as Entity}
          parentType="program"
          spec={SPEC}
          targetDef={defWith(rows)}
        />
      </MemoryRouter>
    </QueryClientProvider>,
  )
}

const ROW = [{ id: "11111111-1111-1111-1111-111111111111", name: "Rifaximin" }]

describe("an optional panel", () => {
  it("is offered when the parent says it involves that kind", () => {
    mount({ id: "p1", involves: ["medication"] }, [])
    expect(screen.getByText(/Medications/)).toBeTruthy()
  })

  it("stays out of the way when it is neither involved nor populated", () => {
    const { container } = mount({ id: "p1", involves: [] }, [])
    expect(container.textContent).toBe("")
  })

  it("shows anyway when it holds rows, however `involves` reads", () => {
    // The rule with teeth: turning a panel off must not hide data.
    mount({ id: "p1", involves: [] }, ROW)
    expect(screen.getByText("Rifaximin")).toBeTruthy()
  })
})
