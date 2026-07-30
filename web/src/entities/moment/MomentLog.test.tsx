import { render, screen } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { QueryClient, QueryClientProvider } from "@tanstack/react-query"
import { MemoryRouter } from "react-router-dom"
import { beforeEach, describe, expect, it, vi } from "vitest"
import type { Body } from "@/services/api/crud"
import { MOMENT } from "@/test/fixtures"
import type { Moment } from "@/services/api/types"

/**
 * A moment can be written about.
 *
 * `Record` excluded `moment` from the Log band, so an occasion — the thing
 * people most often take notes about — was the one object in the system with
 * nowhere to write. `moment` was already a legal `entity_type`, so the relation
 * was representable the whole time and simply had no surface: it held **0** rows
 * against 466 subject links of other types. This is the test that makes that
 * number reachable, so it cannot quietly return to zero.
 */

const created: Body[] = []

vi.mock("@/services/api/hooks", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/services/api/hooks")>()),
  moments: {
    resource: "moments",
    useGet: () => ({ data: undefined }),
    useList: () => ({ data: [] }),
    useUpdate: () => ({ mutate: vi.fn() }),
    useRemove: () => ({ mutate: vi.fn() }),
    useCreate: () => ({ mutate: vi.fn(), mutateAsync: vi.fn() }),
  },
  useCreateMomentWithImages: () => async (body: Body) => {
    created.push(body)
    return { id: "new" }
  },
  useMomentsCalendar: () => ({ data: [] }),
  useMomentYear: () => ({ data: [], isLoading: false }),
  useMomentCorpus: () => ({ data: [], isFetching: false }),
  useMomentsMentioning: () => ({ data: [] }),
}))

const { MomentDetail } = await import("@/entities/moment/Detail")

const OCCASION = { ...MOMENT, kind: "occasion", title: "Team sync" } satisfies Moment

function mount(entity: Moment) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  return render(
    <QueryClientProvider client={qc}>
      <MemoryRouter>
        <MomentDetail entity={entity} onClose={() => {}} />
      </MemoryRouter>
    </QueryClientProvider>,
  )
}

beforeEach(() => {
  created.length = 0
})

describe("a moment's Log band", () => {
  it("is there, on an occasion", () => {
    mount(OCCASION)
    expect(screen.getByText("Log")).toBeInTheDocument()
    expect(screen.getByPlaceholderText("What's on your mind?")).toBeInTheDocument()
  })

  // Not occasions-only: the exclusion was replaced by no rule at all, because
  // `subject` vs `mention` already draws the line for every other type.
  it("is there on a reflection too", () => {
    mount({ ...MOMENT, kind: "reflection" } satisfies Moment)
    expect(screen.getByPlaceholderText("What's on your mind?")).toBeInTheDocument()
  })

  it("roots what you write at the moment you are on", async () => {
    mount(OCCASION)
    const user = userEvent.setup()
    await user.type(
      screen.getByPlaceholderText("What's on your mind?"),
      "Brian wants us more product-oriented",
    )
    await user.click(screen.getByRole("button", { name: "Post" }))

    expect(created).toHaveLength(1)
    expect(created[0].kind).toBe("observation")
    expect(created[0].links).toEqual([
      { role: "subject", entity_type: "moment", entity_id: MOMENT.id },
    ])
  })
})
