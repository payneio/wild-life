import { render, screen } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { QueryClient, QueryClientProvider } from "@tanstack/react-query"
import { MemoryRouter } from "react-router-dom"
import { beforeEach, describe, expect, it, vi } from "vitest"
import { PROTOCOL, ROUTINE } from "@/test/fixtures"

const update = vi.fn()
const create = vi.fn()
const remove = vi.fn()
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
  routines: {
    resource: "routines",
    useList: () => ({ data: steps }),
    useGet: () => ({ data: undefined }),
    useCreate: () => ({ mutate: create }),
    useUpdate: () => ({ mutate: update }),
    useRemove: () => ({ mutate: remove }),
  },
}))

const { ProtocolExtra } = await import("@/components/detailExtras")

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
