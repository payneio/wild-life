import { render, screen } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { QueryClient, QueryClientProvider } from "@tanstack/react-query"
import { MemoryRouter } from "react-router-dom"
import { describe, expect, it, vi } from "vitest"

/**
 * The `@` key opens the mention picker.
 *
 * This is the one gesture that makes a note *about* something, and nothing
 * covered it — the composer's own tests stop at what it submits, and
 * `PickerBody`'s stop at the list once it is open. The seam between them is a
 * three-line regex on a caret position, which is exactly the kind of thing that
 * breaks silently and is noticed by a person rather than a suite.
 */

// Partial: the registry (reached through the composer's pickers) constructs a
// crud for every entity at module scope, so a total mock cannot load.
vi.mock("@/services/api/hooks", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/services/api/hooks")>()),
  moments: {
    resource: "moments",
    useGet: () => ({ data: undefined }),
    useList: () => ({ data: [] }),
    useUpdate: () => ({ mutate: vi.fn() }),
    useRemove: () => ({ mutate: vi.fn() }),
    // `useEntityCreators` calls this for every registry entry to build the
    // picker's quick-create row, so a mock without it crashes the picker.
    useCreate: () => ({ mutate: vi.fn(), mutateAsync: vi.fn() }),
  },
}))

vi.mock("@/services/api/mentions", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/services/api/mentions")>()),
  useEntityResolver: () => () => "Something",
  mergeLinks: () => [],
}))

const { MomentComposer } = await import("@/components/MomentComposer")

function mount() {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  return render(
    <QueryClientProvider client={qc}>
      <MemoryRouter>
        <MomentComposer
          kind="reflection"
          mode="create"
          onSubmit={() => {}}
          placeholder="What's on your mind?"
        />
      </MemoryRouter>
    </QueryClientProvider>,
  )
}

const PICKER = "Search people, places, projects…"

async function type(text: string) {
  const user = userEvent.setup()
  await user.type(screen.getByPlaceholderText("What's on your mind?"), text)
}

describe("the @ key opens the mention picker", () => {
  it("opens on @ at the very start of an empty body", async () => {
    mount()
    expect(screen.queryByPlaceholderText(PICKER)).toBeNull()
    await type("@")
    expect(screen.getByPlaceholderText(PICKER)).toBeTruthy()
  })

  it("opens on @ after a space, mid-sentence", async () => {
    mount()
    await type("spoke with @")
    expect(screen.getByPlaceholderText(PICKER)).toBeTruthy()
  })

  // The old rule required whitespace, so `@` was dead after every punctuation
  // mark — the way you actually write "(@abby" or "Ben, @abby".
  it.each([
    ["after a comma", "Ben, @"],
    ["after a period", "done.@"],
    ["after an open paren", "("],
    ["after a dash", "with -@"],
  ])("opens %s", async (_label, text) => {
    mount()
    await type(text.endsWith("@") ? text : `${text}@`)
    expect(screen.getByPlaceholderText(PICKER)).toBeTruthy()
  })

  it("opens on a fresh line", async () => {
    mount()
    await type("notes{Enter}@")
    expect(screen.getByPlaceholderText(PICKER)).toBeTruthy()
  })

  it("stays shut for an @ welded to a word, which is an email not a mention", async () => {
    mount()
    await type("paul@")
    expect(screen.queryByPlaceholderText(PICKER)).toBeNull()
  })

  it("stays shut for a second @ in an address", async () => {
    mount()
    await type("a@@")
    expect(screen.queryByPlaceholderText(PICKER)).toBeNull()
  })

  it("closes again once the @ stops being the last thing typed", async () => {
    mount()
    await type("@")
    expect(screen.getByPlaceholderText(PICKER)).toBeTruthy()
    await type("x")
    expect(screen.queryByPlaceholderText(PICKER)).toBeNull()
  })
})
