// The nested-read query keys, and the one rule that makes them live.
//
// Mutations here deliberately do NOT invalidate (see AGENTS.md → SSE-driven
// reactivity). Every write lands in the backend change_log, fans out over
// LISTEN/NOTIFY, and `live.ts` invalidates `[<changed table, hyphenated>]`.
// A prefix that doesn't match that string is a query nothing can ever refresh:
// the data appears only on a hard reload.
//
// That is exactly what happened — `useMetricEntries` was keyed
// `["metrics", id, "entries"]`, so a new metric entry (which fires
// `["metric-entries"]`) never reached it. These tests pin the rule for every
// nested hook rather than just the one that was reported, because the mistake is
// invisible by inspection: the key looks right, it just names the endpoint's
// parent instead of the resource whose changes matter.
import { QueryClient, QueryClientProvider } from "@tanstack/react-query"
import { renderHook, waitFor } from "@testing-library/react"
import type { ReactNode } from "react"
import { beforeEach, describe, expect, it, vi } from "vitest"

const get = vi.fn(() => Promise.resolve([]))
vi.mock("@/services/api/client", () => ({ apiClient: { get: (...a: unknown[]) => get(...(a as [])) } }))

const {
  useMetricEntries,
  useRoutineInstances,
  usePersonInteractions,
  usePersonAffiliations,
  useOrganizationAffiliations,
  useGoalProjects,
} = await import("@/services/api/hooks")

const ID = "11111111-1111-1111-1111-111111111111"

function wrapper(qc: QueryClient) {
  return ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={qc}>{children}</QueryClientProvider>
  )
}

beforeEach(() => get.mockClear())

/** Mount `hook`, then invalidate exactly what the SSE stream would invalidate
 *  when a row in `resource` changes. Refetch ⇒ the key is reachable. */
async function refetchesWhenChanges(
  hook: () => unknown,
  resource: string,
): Promise<number> {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  renderHook(hook, { wrapper: wrapper(qc) })
  await waitFor(() => expect(get).toHaveBeenCalledTimes(1))
  // Exactly what live.ts does for `kind:"change"` on that table.
  await qc.invalidateQueries({ queryKey: [resource] })
  await waitFor(() => expect(get.mock.calls.length).toBeGreaterThan(1))
  return get.mock.calls.length
}

describe("nested reads are reachable by the SSE invalidation that concerns them", () => {
  // The reported bug: "I clicked Add and the metric didn't show up in the
  // entries list until I hit refresh."
  it("a new metric entry refreshes the metric's entries list", async () => {
    await refetchesWhenChanges(() => useMetricEntries(ID), "metric-entries")
  })

  it("a routine instance refreshes the routine's instances", async () => {
    await refetchesWhenChanges(() => useRoutineInstances(ID), "routine-instances")
  })

  it("an interaction refreshes the person's interactions", async () => {
    await refetchesWhenChanges(() => usePersonInteractions(ID), "interactions")
  })

  // Both sides of the join, separately — one `it` per mount, because the call
  // counter is shared and two mounts in one test can't tell whose refetch fired.
  it("an affiliation refreshes the person's side of the join", async () => {
    await refetchesWhenChanges(() => usePersonAffiliations(ID), "affiliations")
  })

  it("an affiliation refreshes the organization's side of the join", async () => {
    await refetchesWhenChanges(() => useOrganizationAffiliations(ID), "affiliations")
  })

  it("a goal-project link refreshes the goal's projects", async () => {
    await refetchesWhenChanges(() => useGoalProjects(ID), "goal-projects")
  })
})

describe("the rule has teeth", () => {
  it("keying by the endpoint's parent would NOT have refetched", async () => {
    // The shape of the old bug, asserted directly: invalidating the parent
    // resource leaves a child-keyed query untouched. Without this, someone
    // could "fix" a future occurrence by re-adding the parent prefix and the
    // tests above would still pass (both prefixes present, one of them dead).
    const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } })
    renderHook(() => useMetricEntries(ID), { wrapper: wrapper(qc) })
    await waitFor(() => expect(get).toHaveBeenCalledTimes(1))

    await qc.invalidateQueries({ queryKey: ["metrics"] })
    await new Promise((r) => setTimeout(r, 20))
    expect(get).toHaveBeenCalledTimes(1)
  })
})
