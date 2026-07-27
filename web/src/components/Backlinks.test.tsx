import { render, screen } from "@testing-library/react"
import { MemoryRouter } from "react-router-dom"
import { describe, expect, it, vi } from "vitest"

const rooted = {
  id: "1",
  title: "Filed under this area",
  entity_type: "area",
  entity_id: "A",
  entry_date: null,
}
const elsewhere = {
  id: "2",
  title: "Filed under a program",
  entity_type: "program",
  entity_id: "P",
  entry_date: null,
}

vi.mock("@/services/api/hooks", () => ({
  useNotesLinkedTo: () => ({ data: [rooted, elsewhere] }),
}))

const { Backlinks } = await import("@/components/Backlinks")

/**
 * "Mentioned in" earns its space by showing what the Notes panel above it does
 * not. On a real area, 18 of 20 mentions were notes already listed there — the
 * same rows, told twice.
 */
describe("Mentioned in", () => {
  it("shows a note that references this entity from somewhere else", () => {
    render(
      <MemoryRouter>
        <Backlinks type="area" id="A" />
      </MemoryRouter>,
    )
    expect(screen.getByText("Filed under a program")).toBeTruthy()
  })

  it("drops a note whose own root is this entity — the Notes panel has it", () => {
    render(
      <MemoryRouter>
        <Backlinks type="area" id="A" />
      </MemoryRouter>,
    )
    expect(screen.queryByText("Filed under this area")).toBeNull()
  })
})
