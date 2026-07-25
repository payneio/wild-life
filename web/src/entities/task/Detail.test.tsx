import { render, screen } from "@testing-library/react"
import { QueryClient, QueryClientProvider } from "@tanstack/react-query"
import { MemoryRouter } from "react-router-dom"
import { describe, expect, it, vi } from "vitest"
import { Record } from "@/components/record/Record"
import { recordFields } from "@/components/record/typed"
import { REGISTRY } from "@/services/api/registry"
import { TaskDetail } from "@/entities/task/Detail"
import { TASK } from "@/test/fixtures"
import type { Task } from "@/services/api/types"

vi.mock("@/notes/floatingNoteContext", () => ({
  useFloatingNote: () => ({ openNote: vi.fn() }),
}))

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
    expect(screen.getByDisplayValue("@errands")).toBeInTheDocument()
  })

  it("keeps every status reachable, including the off-lane ones", () => {
    mount(<TaskDetail entity={TASK} onClose={() => {}} />)
    // The old segmented control offered four of the eight statuses, so
    // `cancelled` and `delegated` could not be set from the detail page at all.
    for (const status of ["inbox", "delegated", "delivered", "cancelled"]) {
      expect(screen.getByRole("option", { name: status })).toBeInTheDocument()
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
