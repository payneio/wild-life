import { render, screen, waitFor } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { QueryClient, QueryClientProvider, onlineManager } from "@tanstack/react-query"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

/**
 * The whiteboard lost 2,755 bytes on 2026-08-01: opened offline, where the
 * paused query left `data` undefined, the page rendered that as an empty buffer
 * and saved three edits over the real one when the phone reconnected.
 *
 * Each test here is one link of that chain, held open.
 */

const SERVER_TEXT = "notes that took months to accumulate"

class ApiError extends Error {
  status: number
  constructor(status: number, message: string) {
    super(message)
    this.status = status
  }
}

let online = true
let version = 7
const put = vi.fn(async (_path: string, body: unknown) => {
  if (!online) throw new TypeError("Failed to fetch")
  const { content, base_version } = body as { content: string; base_version: number }
  if (base_version !== version) throw new ApiError(409, "moved on")
  version += 1
  return { content, version, updated_at: "2026-08-01T16:00:00Z" }
})
const get = vi.fn(async (path: string) => {
  if (!online) throw new TypeError("Failed to fetch")
  if (path === "/whiteboard/revisions") return []
  return { content: SERVER_TEXT, version, updated_at: "2026-08-01T15:00:00Z" }
})

vi.mock("@/services/api/client", () => ({
  apiClient: {
    get: (...a: unknown[]) => get(...(a as [string])),
    put: (...a: unknown[]) => put(...(a as [string, unknown])),
  },
  ApiError,
}))

const { WhiteboardPage } = await import("@/pages/WhiteboardPage")

function mount() {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  return render(
    <QueryClientProvider client={qc}>
      <WhiteboardPage />
    </QueryClientProvider>,
  )
}

function setOnline(next: boolean) {
  online = next
  onlineManager.setOnline(next)
}

beforeEach(() => {
  version = 7
  setOnline(true)
  vi.clearAllMocks()
})

afterEach(() => setOnline(true))

describe("whiteboard", () => {
  it("offers no editor at all until the buffer has loaded", async () => {
    setOnline(false)
    mount()

    // The failure was that this box existed, empty, over real content.
    expect(screen.queryByPlaceholderText("Scratch…")).toBeNull()
    expect(await screen.findByText(/Offline, so the whiteboard hasn't loaded/)).toBeTruthy()
    // And the old page said "Saved" while showing it.
    expect(screen.queryByText("Saved")).toBeNull()
    expect(put).not.toHaveBeenCalled()
  })

  it("says so, and still writes nothing, when the load fails outright", async () => {
    get.mockRejectedValueOnce(new ApiError(500, "boom"))
    mount()

    expect(await screen.findByText(/Couldn't load the whiteboard/)).toBeTruthy()
    expect(screen.queryByPlaceholderText("Scratch…")).toBeNull()
    expect(put).not.toHaveBeenCalled()
  })

  it("names the version it is replacing on every write", async () => {
    const user = userEvent.setup()
    mount()

    const box = await screen.findByPlaceholderText("Scratch…")
    expect((box as HTMLTextAreaElement).value).toBe(SERVER_TEXT)

    await user.type(box, "!")
    await waitFor(() => expect(put).toHaveBeenCalledTimes(1))
    expect(put.mock.calls[0][1]).toEqual({
      content: `${SERVER_TEXT}!`,
      base_version: 7,
    })
  })

  it("sends one write on reconnect, not the queue of everything typed offline", async () => {
    const user = userEvent.setup()
    mount()
    const box = await screen.findByPlaceholderText("Scratch…")

    setOnline(false)
    await user.type(box, " one")
    await waitFor(() => expect(screen.getByText(/Offline/)).toBeTruthy())
    await user.type(box, " two")
    await waitFor(() => expect(put.mock.calls.length).toBeGreaterThan(1))

    const attempts = put.mock.calls.length
    setOnline(true)

    await waitFor(() => expect(screen.getByText("Saved")).toBeTruthy())
    // Exactly one write since reconnecting, carrying the latest text — not one
    // per debounce, each claiming the same stale base version.
    expect(put.mock.calls.length).toBe(attempts + 1)
    expect(put.mock.calls.at(-1)?.[1]).toEqual({
      content: `${SERVER_TEXT} one two`,
      base_version: 7,
    })
  })

  it("refuses a write over a version it never read, and lets you choose", async () => {
    const user = userEvent.setup()
    mount()
    const box = await screen.findByPlaceholderText("Scratch…")

    // Somebody else writes while this page holds version 7.
    version = 9

    await user.type(box, "!")
    await waitFor(() => expect(screen.getByText(/Changed somewhere else/)).toBeTruthy())
    expect(screen.getByText("Keep mine")).toBeTruthy()
    expect(screen.getByText("Take theirs")).toBeTruthy()
    // The typing is still on screen — a conflict is not a reason to drop it.
    expect((box as HTMLTextAreaElement).value).toBe(`${SERVER_TEXT}!`)

    // "Keep mine" retries against the version the refetch brought back.
    await user.click(screen.getByText("Keep mine"))
    await waitFor(() => expect(screen.getByText("Saved")).toBeTruthy())
    expect(put.mock.calls.at(-1)?.[1]).toEqual({
      content: `${SERVER_TEXT}!`,
      base_version: 9,
    })
  })
})
