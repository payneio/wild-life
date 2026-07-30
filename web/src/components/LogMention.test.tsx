import { render, screen } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { QueryClient, QueryClientProvider } from "@tanstack/react-query"
import { MemoryRouter } from "react-router-dom"
import { describe, expect, it, vi } from "vitest"

/**
 * The `@` picker, at the two surfaces that mount the same composer.
 *
 * `MomentComposer.test.tsx` covers the gesture in isolation and passes; the
 * report was that it works in a record's Log band and not in the Journal. The
 * two differ by exactly the props `JournalRoute` adds — `autoFocus` and
 * `deepLink` — so the difference has to be reproduced through `Log`, not
 * through the composer alone.
 */

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
  useCreateMomentWithImages: () => async () => ({ id: "m1" }),
  useMomentsCalendar: () => ({ data: [] }),
  useMomentYear: () => ({ data: [], isLoading: false }),
  useMomentCorpus: () => ({ data: [], isFetching: false }),
  useMomentsMentioning: () => ({ data: [] }),
}))

vi.mock("@/services/api/mentions", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/services/api/mentions")>()),
  useEntityResolver: () => () => "Something",
  mergeLinks: () => [],
}))

const { Log } = await import("@/components/Log")

const PICKER = "Search people, places, projects…"

function mount(ui: React.ReactNode) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  return render(
    <QueryClientProvider client={qc}>
      <MemoryRouter>{ui}</MemoryRouter>
    </QueryClientProvider>,
  )
}

async function typeAt() {
  const user = userEvent.setup()
  await user.type(screen.getByPlaceholderText("What's on your mind?"), "@")
}

describe("the @ picker opens in every log", () => {
  it("opens in a record's Log band", async () => {
    mount(<Log subject={{ type: "program", id: "P1" }} base="/moments" />)
    await typeAt()
    expect(screen.getByPlaceholderText(PICKER)).toBeTruthy()
  })

  // Exactly how JournalRoute mounts it.
  it("opens in the Journal", async () => {
    mount(<Log kind="reflection" heading="Journal" base="/notes" deepLink autoFocus />)
    await typeAt()
    expect(screen.getByPlaceholderText(PICKER)).toBeTruthy()
  })
})
