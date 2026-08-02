import { render, screen } from "@testing-library/react"
import { MemoryRouter } from "react-router-dom"
import { describe, expect, it, vi } from "vitest"

const elsewhere = {
  id: "2",
  kind: "observation",
  title: "Written under a program",
  body: "",
  started_at: null,
  links: [],
}

const asked: { type: string | null; id: string | null }[] = []

// `describeMoment` resolves a subject's name for moments carrying no title, so
// the resolver has to exist even where every fixture has one. Total rather than
// partial: the real module reaches the registry, which reaches the hooks this
// file has already replaced.
vi.mock("@/services/api/mentions", () => ({
  useEntityResolver: () => () => undefined,
}))

vi.mock("@/services/api/hooks", () => ({
  useMomentsMentioning: (type: string | null, id: string | null) => {
    asked.push({ type, id })
    return { data: [elsewhere] }
  },
}))

const { Backlinks } = await import("@/components/Backlinks")

/**
 * "Mentioned in" earns its space by showing what the Log above it does not. On a
 * real area, 18 of 20 mentions were rows already listed there — the same writing,
 * told twice.
 *
 * The panel no longer re-derives that rule. `subject` and `mention` are two of
 * the four closed roles, so "on this thing's timeline" and "in its backlinks"
 * are different queries rather than one query and a filter — and the exclusion
 * can't drift out of step with the Log. `api/tests/test_moments.py` pins the
 * server half.
 */
describe("Mentioned in", () => {
  it("reads the mention-scoped stream, not every moment linked to the entity", () => {
    asked.length = 0
    render(
      <MemoryRouter>
        <Backlinks type="area" id="A" />
      </MemoryRouter>,
    )
    expect(asked).toEqual([{ type: "area", id: "A" }])
    expect(screen.getByText("Written under a program")).toBeTruthy()
  })
})
