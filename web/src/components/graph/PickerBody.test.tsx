import { render, screen } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { QueryClient, QueryClientProvider } from "@tanstack/react-query"
import { MemoryRouter } from "react-router-dom"
import { describe, expect, it, vi } from "vitest"
import { PROJECT } from "@/test/fixtures"

/**
 * Projects the picker searches over: 8 live, 5 finished, and one archived
 * "Atlas" — the duplicate-create trap.
 */
const live = ["Aurora", "Bedrock", "Cascade", "Delta", "Everest", "Foxglove", "Granite", "Harbor"]
const finished = ["Old Migration", "Legacy Port", "Retired Site", "Sunset Plan"]
const PROJECTS = [
  ...live.map((name, i) => ({ ...PROJECT, id: `live-${i}`, name, status: "active", program_id: "program-1" })),
  ...finished.map((name, i) => ({ ...PROJECT, id: `done-${i}`, name, status: "completed" })),
  { ...PROJECT, id: "atlas", name: "Atlas", status: "archived" },
]

const PROGRAMS = [{ ...PROJECT, id: "program-1", name: "Sleep" }]
const SELF = "person-me"
const PEOPLE = [
  { ...PROJECT, id: "person-a", name: "Aaron Diaz" },
  { ...PROJECT, id: SELF, name: "Zoe Vance" },
  { ...PROJECT, id: "person-b", name: "Bea Cross" },
]

const createProject = vi.fn(async () => ({ ...PROJECT, id: "new", name: "Atlas" }))

/** What a surface with context hands the picker — a project is born under a
 *  program, so a picker with no program to name can't offer to create one. */
const INHERITED = { program_id: "program-1" }

// Override only the projects crud; every other source stays real (and returns
// nothing in test), so this can't drift from the hooks the picker actually uses.
vi.mock("@/services/api/hooks", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/services/api/hooks")>()),
  people: {
    resource: "people",
    useList: () => ({ data: PEOPLE }),
    useGet: () => ({ data: undefined }),
    useCreate: () => ({ mutateAsync: vi.fn() }),
    useUpdate: () => ({ mutate: vi.fn() }),
    useRemove: () => ({ mutate: vi.fn() }),
  },
  programs: {
    resource: "programs",
    useList: () => ({ data: PROGRAMS }),
    useGet: () => ({ data: undefined }),
    useCreate: () => ({ mutateAsync: vi.fn() }),
    useUpdate: () => ({ mutate: vi.fn() }),
    useRemove: () => ({ mutate: vi.fn() }),
  },
  projects: {
    resource: "projects",
    useList: () => ({ data: PROJECTS }),
    useGet: () => ({ data: undefined }),
    useCreate: () => ({ mutateAsync: createProject }),
    useUpdate: () => ({ mutate: vi.fn() }),
    useRemove: () => ({ mutate: vi.fn() }),
  },
}))

const { PickerBody } = await import("@/components/graph/PickerBody")

function mount(ui: React.ReactNode, selfPersonId?: string) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  if (selfPersonId) qc.setQueryData(["me"], { role: "full", person_id: selfPersonId })
  return render(
    <QueryClientProvider client={qc}>
      <MemoryRouter>{ui}</MemoryRouter>
    </QueryClientProvider>,
  )
}

const rows = () => screen.getAllByRole("button").map((b) => b.textContent ?? "")
const rowNamed = (name: string) => rows().filter((t) => t.includes(name))

describe("PickerBody", () => {
  it("shows every match in a type-scoped picker, not six", () => {
    // The reported bug: `limitPerType = 6` capped every FK picker in the app.
    mount(<PickerBody type="project" intent="assign" onSelect={vi.fn()} />)
    for (const name of live) expect(rowNamed(name)).toHaveLength(1)
  })

  it("withholds finished rows when assigning", () => {
    mount(<PickerBody type="project" intent="assign" onSelect={vi.fn()} />)
    expect(rowNamed("Aurora")).toHaveLength(1)
    expect(rowNamed("Old Migration")).toHaveLength(0)
    expect(rowNamed("Sunset Plan")).toHaveLength(0)
  })

  it("shows finished rows when referencing", () => {
    // A note about a completed project is the normal case.
    mount(<PickerBody type="project" intent="reference" onSelect={vi.fn()} />)
    expect(rowNamed("Old Migration")).toHaveLength(1)
    expect(rowNamed("Atlas")).toHaveLength(1)
  })

  it("accounts for what it withheld instead of pretending it doesn't exist", async () => {
    mount(<PickerBody type="project" intent="assign" onSelect={vi.fn()} />)
    const reveal = screen.getByRole("button", { name: /hidden/i })
    // Names the reason and the count, not just "some rows".
    expect(reveal.textContent).toMatch(/5/)
    expect(reveal.textContent?.toLowerCase()).toMatch(/completed|archived/)

    await userEvent.click(reveal)
    expect(rowNamed("Old Migration")).toHaveLength(1)
    expect(screen.queryByRole("button", { name: /hidden/i })).toBeNull()
  })

  it("never says 'No matches' for something that exists but was withheld", async () => {
    mount(<PickerBody type="project" intent="assign" onSelect={vi.fn()} />)
    await userEvent.type(screen.getByRole("textbox"), "Sunset")
    expect(screen.queryByText("No matches.")).toBeNull()
    expect(screen.getByRole("button", { name: /hidden/i })).toBeTruthy()
  })

  it("does not offer to create a name that exists but is hidden", async () => {
    // The defect the filter would otherwise introduce: `exact` computed over the
    // filtered rows would miss archived "Atlas" and offer to create a duplicate.
    mount(<PickerBody type="project" intent="assign" allowCreate createDefaults={INHERITED} onSelect={vi.fn()} />)
    await userEvent.type(screen.getByRole("textbox"), "Atlas")

    expect(screen.queryByText(/Create/)).toBeNull()
    // …and the row you'd have duplicated is pinned into view, badge and all.
    expect(rowNamed("Atlas")).toHaveLength(1)
  })

  it("still offers to create a genuinely new name", async () => {
    mount(<PickerBody type="project" intent="assign" allowCreate createDefaults={INHERITED} onSelect={vi.fn()} />)
    await userEvent.type(screen.getByRole("textbox"), "Brand New Thing")
    expect(screen.getByText(/Create/)).toBeTruthy()
  })

  it("withholds create when the type needs context the caller hasn't got", async () => {
    // A project is born under a program, a metric under whatever it measures.
    // Offering "Create" with nothing to file it under posted a bare title and
    // got a 422 back — the picker advertised a gesture the API always refused.
    mount(<PickerBody type="project" intent="assign" allowCreate onSelect={vi.fn()} />)
    await userEvent.type(screen.getByRole("textbox"), "Brand New Thing")
    expect(screen.queryByText(/Create/)).toBeNull()
  })

  it("keeps one source from crowding out the others when untyped", () => {
    // Cross-type search still rations per type; only the scoped case is unlimited.
    mount(<PickerBody intent="reference" onSelect={vi.fn()} />)
    const projectRows = [...live, ...finished, "Atlas"].filter((n) => rowNamed(n).length > 0)
    expect(projectRows).toHaveLength(6)
  })

  it("says how many matches it could not show", () => {
    mount(<PickerBody type="project" intent="reference" limit={3} onSelect={vi.fn()} />)
    expect(screen.getByText(/10 more — keep typing/)).toBeTruthy()
  })

  it("spends the row's right-hand slot on what tells rows apart", () => {
    // Scoped to one type, printing "Project" on all 13 rows says nothing; the
    // parent does. Requires the resolver, since a row carries program_id.
    mount(<PickerBody type="project" intent="assign" onSelect={vi.fn()} />)
    expect(rowNamed("Aurora")[0]).toContain("Sleep")
    expect(rowNamed("Aurora")[0]).not.toContain("Project")
  })

  it("puts you first in a people picker, whatever your name sorts as", () => {
    // Every Assignee / Responsible / Owner field is a person-scoped picker, and
    // the person you most often mean is yourself. "Zoe" would otherwise be last.
    mount(<PickerBody type="person" intent="assign" onSelect={vi.fn()} />, SELF)
    expect(rows()[0]).toContain("Zoe Vance")
  })

  it("sorts people normally when no self person is configured", () => {
    // Unset config is a valid state, not an error.
    mount(<PickerBody type="person" intent="assign" onSelect={vi.fn()} />)
    expect(rows()[0]).toContain("Aaron Diaz")
  })

  it("does not hoist you above other types in a cross-type picker", () => {
    // There, one person outranking every project and note is noise.
    mount(<PickerBody intent="reference" onSelect={vi.fn()} />, SELF)
    expect(rows()[0]).not.toContain("Zoe Vance")
  })

  it("keeps keyboard selection aligned after revealing hidden rows", async () => {
    const onSelect = vi.fn()
    mount(<PickerBody type="project" intent="assign" onSelect={onSelect} />)
    await userEvent.type(screen.getByRole("textbox"), "Sunset")
    await userEvent.click(screen.getByRole("button", { name: /hidden/i }))

    await userEvent.keyboard("{Enter}")
    expect(onSelect).toHaveBeenCalledTimes(1)
    expect(onSelect.mock.calls[0][0].label).toBe("Sunset Plan")
  })
})
