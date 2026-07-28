import { render, screen } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { QueryClient, QueryClientProvider } from "@tanstack/react-query"
import { MemoryRouter } from "react-router-dom"
import { beforeEach, describe, expect, it, vi } from "vitest"
import { PROGRAM } from "@/test/fixtures"
import { REGISTRY } from "@/services/api/registry"
import type { Instant } from "@/lib/date"
import type { EventItem } from "@/services/api/types"

const create = vi.fn()

const evts = [
  {
    id: "ev-1",
    title: "Endoscopy",
    start_at: "2026-05-19T19:00:00Z" as Instant,
    event_type: "appointment",
  },
] as unknown as EventItem[]

vi.mock("@/services/api/hooks", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/services/api/hooks")>()),
  events: {
    resource: "events",
    useList: () => ({ data: evts }),
    useGet: () => ({ data: undefined }),
    useCreate: () => ({ mutate: create }),
    useUpdate: () => ({ mutate: vi.fn() }),
    useRemove: () => ({ mutate: vi.fn() }),
  },
}))

const { ProgramTimeline } = await import("@/components/detail/planning")

function mount(entity = PROGRAM) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  return render(
    <QueryClientProvider client={qc}>
      <MemoryRouter>
        <ProgramTimeline entity={entity} />
      </MemoryRouter>
    </QueryClientProvider>,
  )
}

beforeEach(() => create.mockClear())

describe("the program timeline", () => {
  it("records an event where the history is read", async () => {
    const user = userEvent.setup()
    mount()
    await user.type(screen.getByPlaceholderText("What happened…"), "Colonoscopy{Enter}")

    expect(create).toHaveBeenCalled()
    const [body] = create.mock.calls[0]
    expect(body.title).toBe("Colonoscopy")
    expect(body.entity_type).toBe("program")
    expect(body.entity_id).toBe(PROGRAM.id)
    // All-day: from an object's page the question is what day it happened, not
    // at what o'clock (see `EventCapture`).
    expect(body.all_day).toBe(true)
  })

  it("is a band, so it is there before there is any history", () => {
    // The old surface returned null when empty, and the only other way in was a
    // relation panel that also hid itself when empty — between them, a program
    // with no events had nowhere to record its first one.
    mount({ ...PROGRAM, start_date: null, ended_date: null })
    expect(screen.getByPlaceholderText("What happened…")).toBeInTheDocument()
  })

  it("lists the events filed under the program", () => {
    mount()
    expect(screen.getByText("Endoscopy")).toBeInTheDocument()
    expect(screen.getByText("Appointment")).toBeInTheDocument()
  })
})

describe("the program's relations", () => {
  it("declares no Events panel, because the timeline is the events surface", () => {
    // Both at once is what shipped: the IMO page drew its 21 events in the
    // timeline and again in an `Events · 21` panel five panels down, which is
    // where the capture had been sitting unfound. A bespoke rendering earned
    // under ui-architecture §5 replaces the generic one; it doesn't join it.
    const relations = REGISTRY.program.relations ?? []
    expect(relations.map((r) => r.type)).not.toContain("event")
  })
})
