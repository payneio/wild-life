import { render, screen } from "@testing-library/react"
import { QueryClient, QueryClientProvider } from "@tanstack/react-query"
import { MemoryRouter } from "react-router-dom"
import { describe, expect, it } from "vitest"
import { Record } from "@/components/record/Record"
import { recordFields } from "@/components/record/typed"
import { REGISTRY } from "@/services/api/registry"
import { TaskDetail } from "@/entities/task/Detail"
import { OFF_LANE, STEPS } from "@/entities/task/status"
import { TASK_STATUS } from "@/services/api/enums"
import { TASK } from "@/test/fixtures"
import type { Task } from "@/services/api/types"

function mount(ui: React.ReactNode) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  return render(
    <QueryClientProvider client={qc}>
      <MemoryRouter>{ui}</MemoryRouter>
    </QueryClientProvider>,
  )
}

describe("TaskDetail", () => {
  it("shows the task's own values", () => {
    mount(<TaskDetail entity={TASK} onClose={() => {}} />)
    expect(screen.getByDisplayValue("Renew the passport")).toBeInTheDocument()
    expect(screen.getByDisplayValue("Photos, form DS-82, cheque")).toBeInTheDocument()
  })

  it("offers every status the column accepts", () => {
    // Driven by the enum, so adding a status on the backend fails here instead
    // of quietly becoming unsettable. The old lane offered four of the eight,
    // which is how `cancelled` and `delegated` ended up unreachable.
    const offered = new Set<string>([...STEPS.map((s) => s.value), ...OFF_LANE])
    for (const status of TASK_STATUS) {
      expect(offered.has(status), `status "${status}" is offered by no control`).toBe(true)
    }
  })

  it("renders the off-lane statuses as an overflow", () => {
    mount(<TaskDetail entity={TASK} onClose={() => {}} />)
    for (const status of OFF_LANE) {
      expect(screen.getByRole("option", { name: status })).toBeInTheDocument()
    }
    for (const step of STEPS) {
      expect(screen.getByRole("button", { name: step.label })).toBeInTheDocument()
    }
  })
})

describe("coverage detector", () => {
  it("reports fields a layout drops", () => {
    // Guards the guard: if this ever came back empty, the coverage suite would
    // pass vacuously for every entity.
    let missing: string[] = []
    const F = recordFields<Task>()
    mount(
      <Record
        def={REGISTRY.task}
        entity={TASK}
        onClose={() => {}}
        omit={["completed_at", "claimed_by_id", "claimed_at"]}
        onCoverage={(m) => (missing = m)}
      >
        <F.Title field="title" />
      </Record>,
    )
    expect(missing).toContain("status")
    expect(missing).toContain("due_date")
    expect(missing).not.toContain("completed_at")
    expect(missing).not.toContain("created_at")
  })
})
