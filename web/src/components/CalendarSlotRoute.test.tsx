import { render, screen, waitFor } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { QueryClient, QueryClientProvider } from "@tanstack/react-query"
import { MemoryRouter, Route, Routes } from "react-router-dom"
import { beforeEach, describe, expect, it, vi } from "vitest"
import type { Body } from "@/services/api/crud"

/**
 * Writing on a slot that has no row yet.
 *
 * A recurring meeting is projected and never stored, so it has no id; the grid
 * used to send the click to the *series*, which is how one Thursday's notes came
 * to be filed on the rule that generates every Thursday. Opening the slot must
 * not create anything — "computed, never materialised" — but writing must,
 * because a note about this Thursday is something that happened to it.
 */

const RULE = "83ced2b4-75e8-4fe6-8e84-dc9f8d74f58a"
// What the API answers: an offset form. The URL carries the same instant
// normalised to Z. They are equal as instants and unequal as text.
const OCC_OFFSET = "2026-07-30T08:30:00-07:00"
const OCC_Z = "2026-07-30T15:30:00Z"

const created: Body[] = []
const materialised: unknown[] = []

vi.mock("@/services/api/hooks", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/services/api/hooks")>()),
  useOccurrences: () => ({
    data: [
      {
        rule_id: RULE,
        moment_id: null,
        occurrence_at: OCC_OFFSET,
        start_at: OCC_OFFSET,
        end_at: "2026-07-30T13:00:00-07:00",
        all_day: false,
        title: "MADE: Explore team meeting",
      },
    ],
    isLoading: false,
  }),
  routines: {
    resource: "routines",
    useGet: () => ({
      data: { id: RULE, name: null, days_of_week: ["thu"], interval_days: 1, timing: [], end_date: null },
    }),
    useList: () => ({ data: [] }),
  },
  useEditOccurrence: () => ({
    mutateAsync: async (v: unknown) => {
      materialised.push(v)
      return { moment_id: "new-occurrence-id" }
    },
  }),
  useCreateMomentWithImages: () => async (body: Body) => {
    created.push(body)
    return { id: "note-id" }
  },
}))

const { CalendarSlotRoute } = await import("@/components/CalendarSlotRoute")

function mount() {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  return render(
    <QueryClientProvider client={qc}>
      <MemoryRouter
        initialEntries={[`/calendar/slot/${RULE}?occ=${encodeURIComponent(OCC_Z)}`]}
      >
        <Routes>
          <Route path="/calendar/slot/:ruleId" element={<CalendarSlotRoute />} />
          <Route path="/calendar/:id" element={<div>the record</div>} />
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>,
  )
}

beforeEach(() => {
  created.length = 0
  materialised.length = 0
})

describe("a projected slot", () => {
  // The first version compared `occurrence_at === occ` and found nothing, so it
  // rendered "no longer on the calendar" over a meeting plainly on the grid.
  it("is matched by instant, not by string", () => {
    mount()
    expect(screen.getAllByText("MADE: Explore team meeting").length).toBeGreaterThan(0)
    expect(screen.queryByText(/no longer on the calendar/)).toBeNull()
  })

  // The click used to land on the series, so the series was always reachable.
  // Routing it to the occurrence took that away unless the slot says what
  // generates it — which is the one thing a slot cannot omit.
  it("names its series and links to it", async () => {
    mount()
    // Rendered twice — the desktop Modal and the mobile Drawer both mount.
    const links = await screen.findAllByRole("link", { name: "the series" })
    expect(links.length).toBeGreaterThan(0)
    expect(links[0].getAttribute("href")).toBe(`/routines/${RULE}`)
  })

  it("creates nothing merely by being opened", () => {
    mount()
    expect(materialised).toEqual([])
    expect(created).toEqual([])
  })

  it("materialises the slot on the first note, and roots the note at it", async () => {
    mount()
    const user = userEvent.setup()
    await user.type(
      screen.getAllByPlaceholderText("What's on your mind?")[0],
      "Brian wants us more product-oriented",
    )
    await user.keyboard("{Control>}{Enter}{/Control}")

    await waitFor(() => expect(created).toHaveLength(1))

    expect(materialised).toEqual([
      { scope: "this", rule_id: RULE, occurrence_at: OCC_Z, changes: {} },
    ])
    expect(created[0].links).toContainEqual({
      role: "subject",
      entity_type: "moment",
      entity_id: "new-occurrence-id",
    })
  })
})
