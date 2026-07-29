import { render, screen } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { QueryClient, QueryClientProvider } from "@tanstack/react-query"
import { MemoryRouter } from "react-router-dom"
import { beforeEach, describe, expect, it, vi } from "vitest"
import type { Body } from "@/services/api/crud"
import { MOMENT } from "@/test/fixtures"

const created: Body[] = []
const scopes: unknown[] = []
/** The stream the mocked year query returns; set per test. */
const rows: unknown[] = []
/** The grouped counts that decide whether a log is an archive or a short list. */
const buckets: { year: number; month: number; count: number }[] = []

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
  },
  useCreateMomentWithImages: () => async (body: Body) => {
    created.push(body)
    return { id: "m1" }
  },
  useMomentsCalendar: (scope: unknown) => {
    scopes.push(scope)
    return { data: buckets }
  },
  useMomentYear: () => ({ data: rows, isLoading: false }),
  useMomentCorpus: () => ({ data: [], isFetching: false }),
  useMomentsMentioning: () => ({ data: [] }),
}))

vi.mock("@/services/api/mentions", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/services/api/mentions")>()),
  useEntityResolver: () => () => "Something",
  mentionToken: (r: { label: string; type: string; id: string }) => `[@${r.label}](${r.type}:${r.id})`,
  mergeLinks: () => [],
}))

const { Log } = await import("@/components/Log")

function mount(ui: React.ReactNode) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  return render(
    <QueryClientProvider client={qc}>
      <MemoryRouter>{ui}</MemoryRouter>
    </QueryClientProvider>,
  )
}

async function write(text: string) {
  const user = userEvent.setup()
  await user.type(screen.getByPlaceholderText("What's on your mind?"), text)
  await user.click(screen.getByRole("button", { name: "Post" }))
}

beforeEach(() => {
  created.length = 0
  scopes.length = 0
  rows.length = 0
  buckets.length = 0
})

/** One prose entry, filed at `subject`, in the year the stream is showing. */
function entry(id: string, kind: string, subject: { type: string; id: string } | null) {
  return {
    ...MOMENT,
    id,
    kind,
    title: `Entry ${id}`,
    links: subject
      ? [{ role: "subject", entity_type: subject.type, entity_id: subject.id }]
      : [],
  }
}

/**
 * The rule this pins is the one the whole vocabulary rests on: **kind is written
 * by the surface that creates the moment, and no surface asks the user.**
 *
 * The measurement behind it is `Event.event_type`, null on 1,283 of 1,332 rows —
 * a facet that must be hand-set does not get set. This one carries the inbox
 * predicate, the Journal and the default reading filter, so it cannot be a
 * control that someone forgets to touch.
 */
describe("what a log writes", () => {
  it("writes an observation subject-linked to the record it sits on", async () => {
    mount(<Log subject={{ type: "program", id: "P1" }} base="/moments" />)
    await write("Radiology called back")

    expect(created).toHaveLength(1)
    expect(created[0].kind).toBe("observation")
    expect(created[0].links).toEqual([
      { role: "subject", entity_type: "program", entity_id: "P1" },
    ])
  })

  it("writes a reflection with no subject in the Journal", async () => {
    // The self is the frame, not a subject. 325 links asserting "Paul was
    // present" were deleted in the backfill precisely so the surviving ones mean
    // something; the composer must not author them again.
    mount(<Log kind="reflection" base="/notes" deepLink />)
    await write("Slept badly, but the week turned")

    expect(created).toHaveLength(1)
    expect(created[0].kind).toBe("reflection")
    expect(created[0].links).toEqual([])
  })

  it("scopes its rail exactly the way it scopes its stream", () => {
    // A rail that counts rows the stream doesn't show is worse than no rail, so
    // the role set has to reach both — which is why `role` is repeatable on
    // `/moments/calendar` and not only on the list.
    mount(<Log subject={{ type: "person", id: "X" }} base="/moments" />)
    expect(scopes[0]).toEqual({
      kind: undefined,
      linked_type: "person",
      linked_id: "X",
      role: ["subject", "participant", "place"],
    })
  })

  it("leaves a mention out of a thing's timeline", () => {
    // `subject` puts a moment on a timeline; `mention` puts it in backlinks.
    // Asking for both was showing a reflection that merely named a program in
    // that program's Log *and* in its "Mentioned in" panel directly below.
    mount(<Log subject={{ type: "program", id: "P1" }} base="/moments" />)
    expect((scopes[0] as { role: string[] }).role).not.toContain("mention")
  })
})

/**
 * What a log doesn't say twice.
 *
 * Every one of these was a line that restated its own context: the entry's
 * subject is the record you opened, its kind is the only kind present, and a
 * search box over four rows searches what you can already see. The rule is the
 * same one that took the subject chip out of `Involves` — a log says what the
 * frame doesn't.
 */
describe("what a scoped log leaves out", () => {
  it("drops the About chip when the subject is the record you're on", () => {
    rows.push(entry("m1", "observation", { type: "program", id: "P1" }))
    mount(<Log subject={{ type: "program", id: "P1" }} base="/moments" />)
    expect(screen.queryByTitle("About")).toBeNull()
  })

  it("keeps it when the entry is about something else", () => {
    // Here as a participant or a place, filed under something else — the chip
    // is the only thing saying so, so hiding it would lose the fact.
    rows.push(entry("m1", "observation", { type: "task", id: "T9" }))
    mount(<Log subject={{ type: "program", id: "P1" }} base="/moments" />)
    expect(screen.getByTitle("About")).toBeTruthy()
  })

  it("drops the kind badge when every row is the same act", () => {
    rows.push(entry("m1", "observation", null), entry("m2", "observation", null))
    mount(<Log subject={{ type: "program", id: "P1" }} base="/moments" />)
    expect(screen.queryByText("Note")).toBeNull()
  })

  it("shows the badge as soon as the stream is mixed", () => {
    rows.push(entry("m1", "observation", null), entry("m2", "capture", null))
    mount(<Log subject={{ type: "program", id: "P1" }} base="/moments" />)
    // Both a badge (a span on the row) and an option in the kind filter, which
    // only appears for the same reason — so match the badge specifically.
    const badge = (label: string) =>
      screen.getAllByText(label).some((el) => el.tagName === "SPAN")
    expect(badge("Note")).toBe(true)
    expect(badge("Capture")).toBe(true)
  })

  it("offers no search until the log is an archive", () => {
    rows.push(entry("m1", "observation", null))
    buckets.push({ year: 2026, month: 7, count: 1 })
    mount(<Log subject={{ type: "program", id: "P1" }} base="/moments" />)
    expect(screen.queryByPlaceholderText("Search…")).toBeNull()
  })

  it("offers it once there is more than one screen of history", () => {
    rows.push(entry("m1", "observation", null))
    buckets.push({ year: 2026, month: 7, count: 40 })
    mount(<Log subject={{ type: "program", id: "P1" }} base="/moments" />)
    expect(screen.getByPlaceholderText("Search…")).toBeTruthy()
  })
})
