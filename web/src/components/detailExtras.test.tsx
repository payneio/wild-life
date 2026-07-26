import { render, screen } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { QueryClient, QueryClientProvider } from "@tanstack/react-query"
import { MemoryRouter } from "react-router-dom"
import { beforeEach, describe, expect, it, vi } from "vitest"
import { METRIC, PROTOCOL, ROUTINE } from "@/test/fixtures"
import type { MetricEntry } from "@/services/api/types"
import type { Instant } from "@/lib/date"

const update = vi.fn()
const create = vi.fn()
const remove = vi.fn()
const createEntry = vi.fn()

const entry = (id: string, recorded_at: string, value: number) =>
  ({ ...METRIC, id, metric_id: METRIC.id, recorded_at: recorded_at as Instant, value, notes: null }) as unknown as MetricEntry

// Two readings on the SAME local day. Under the old date-only column these were
// indistinguishable; the time is the only thing that separates them.
const entries = [
  entry("e1", "2026-03-04T15:12:00Z", 128), // 07:12 Pacific
  entry("e2", "2026-03-04T22:03:00Z", 141), // 14:03 Pacific
]
const steps = [
  { ...ROUTINE, id: "step-1", activity: "Heel stretches", medication_id: null },
  {
    ...ROUTINE,
    id: "step-2",
    activity: null,
    medication_id: "44444444-4444-4444-4444-444444444444",
    amount: 500,
    unit: "mg",
  },
]

// Override only the routines crud; everything else in the module stays real, so
// this doesn't quietly drift from the hooks the component actually uses.
vi.mock("@/services/api/hooks", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/services/api/hooks")>()),
  useMetricEntries: () => ({ data: entries }),
  metricEntries: {
    resource: "metric-entries",
    useList: () => ({ data: entries }),
    useGet: () => ({ data: undefined }),
    useCreate: () => ({ mutate: createEntry }),
    useUpdate: () => ({ mutate: vi.fn() }),
    useRemove: () => ({ mutate: vi.fn() }),
  },
  routines: {
    resource: "routines",
    useList: () => ({ data: steps }),
    useGet: () => ({ data: undefined }),
    useCreate: () => ({ mutate: create }),
    useUpdate: () => ({ mutate: update }),
    useRemove: () => ({ mutate: remove }),
  },
}))

const { MetricExtra, ProtocolExtra } = await import("@/components/detailExtras")

function mount(ui: React.ReactNode) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  return render(
    <QueryClientProvider client={qc}>
      <MemoryRouter>{ui}</MemoryRouter>
    </QueryClientProvider>,
  )
}

beforeEach(() => {
  update.mockClear()
  create.mockClear()
  createEntry.mockClear()
})

describe("protocol steps", () => {
  it("lists steps without opening an editor", () => {
    mount(<ProtocolExtra entity={PROTOCOL} />)
    expect(screen.getByText("Heel stretches")).toBeInTheDocument()
    // Modeless: no Save button anywhere, because nothing is staged.
    expect(screen.queryByRole("button", { name: /^save$/i })).toBeNull()
  })

  it("edits a step in place, saving on change", async () => {
    const user = userEvent.setup()
    mount(<ProtocolExtra entity={PROTOCOL} />)
    await user.click(screen.getByText("Heel stretches"))

    const activity = screen.getByDisplayValue("Heel stretches")
    await user.clear(activity)
    await user.type(activity, "Calf raises")
    await user.tab() // blur commits

    expect(update).toHaveBeenCalledWith({
      id: "step-1",
      body: { activity: "Calf raises" },
    })
  })

  it("switches kind by writing both columns at once", async () => {
    const user = userEvent.setup()
    mount(<ProtocolExtra entity={PROTOCOL} />)
    await user.click(screen.getByText("Heel stretches"))
    await user.click(screen.getByRole("button", { name: "Dose" }))

    // One PATCH, not two: a half-applied switch would leave a step that is both
    // a dose and an activity.
    expect(update).toHaveBeenCalledWith({ id: "step-1", body: { activity: null } })
  })

  it("adds a step by creating the row, not by staging a form", async () => {
    const user = userEvent.setup()
    mount(<ProtocolExtra entity={PROTOCOL} />)
    await user.click(screen.getByRole("button", { name: "Add activity" }))

    expect(create).toHaveBeenCalled()
    const [body] = create.mock.calls[0]
    expect(body.protocol_id).toBe(PROTOCOL.id)
    expect(body.activity).toBe("New step")
  })
})

describe("metric entries", () => {
  it("shows the time, so two readings on one day are tellable apart", () => {
    mount(<MetricExtra entity={METRIC} />)
    // Same day label twice — which is exactly why the time has to be there.
    expect(screen.getAllByText("Wed, Mar 4")).toHaveLength(2)
    expect(screen.getByText("7:12 AM")).toBeInTheDocument()
    expect(screen.getByText("2:03 PM")).toBeInTheDocument()
  })

  it("orders newest first", () => {
    mount(<MetricExtra entity={METRIC} />)
    const times = screen.getAllByText(/^\d{1,2}:\d{2} (AM|PM)$/).map((n) => n.textContent)
    expect(times).toEqual(["2:03 PM", "7:12 AM"])
  })

  it("captures a reading as an instant, defaulting to now", async () => {
    const user = userEvent.setup()
    mount(<MetricExtra entity={METRIC} />)
    await user.type(screen.getByPlaceholderText("bpm"), "62")
    await user.click(screen.getByRole("button", { name: "Add" }))

    expect(createEntry).toHaveBeenCalledTimes(1)
    const [body] = createEntry.mock.calls[0]
    expect(body.metric_id).toBe(METRIC.id)
    expect(body.value).toBe(62)
    // An instant, not a bare day: the whole point of the column change.
    expect(body.recorded_at).toMatch(/T\d{2}:\d{2}/)
    expect(Math.abs(Date.parse(body.recorded_at) - Date.now())).toBeLessThan(60_000)
  })

  it("does not create anything from an empty value", async () => {
    const user = userEvent.setup()
    mount(<MetricExtra entity={METRIC} />)
    await user.click(screen.getByRole("button", { name: "Add" }))
    expect(createEntry).not.toHaveBeenCalled()
  })
})
