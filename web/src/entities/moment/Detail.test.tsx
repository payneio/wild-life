import { render, screen } from "@testing-library/react"
import { QueryClient, QueryClientProvider } from "@tanstack/react-query"
import { MemoryRouter } from "react-router-dom"
import { describe, expect, it } from "vitest"
import { MomentDetail } from "@/entities/moment/Detail"
import { MOMENT } from "@/test/fixtures"
import type { Moment } from "@/services/api/types"

function mount(ui: React.ReactNode) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  return render(
    <QueryClientProvider client={qc}>
      <MemoryRouter>{ui}</MemoryRouter>
    </QueryClientProvider>,
  )
}

/**
 * The empty state is the one that matters here, and the coverage suite cannot
 * reach it: it fails a field only when *no* shape renders it, and the populated
 * fixture does. So a body editor that hid itself while empty passed everything
 * — while making a freshly-created calendar slot a record with nowhere to
 * write, and no gesture that could produce one.
 */
describe("MomentDetail — somewhere to write", () => {
  const blank = { ...MOMENT, kind: "occasion", body: "" } satisfies Moment

  it("offers the body editor on an authored slot that has no body yet", () => {
    mount(<MomentDetail entity={blank} onClose={() => {}} />)
    expect(screen.getByText("Description")).toBeInTheDocument()
  })

  // The sender owns that field on a synced meeting — `calendar_mail` rewrites
  // it from the wire on a newer SEQUENCE — so an empty one is not an invitation
  // to write. The Log band is where notes about a meeting go.
  it("shows no empty description on an imported occasion", () => {
    const imported = { ...blank, source: "imported" } satisfies Moment
    mount(<MomentDetail entity={imported} onClose={() => {}} />)
    expect(screen.queryByText("Description")).toBeNull()
  })

  it("still offers it when the body has content", () => {
    const occasion = { ...MOMENT, kind: "occasion" } satisfies Moment
    mount(<MomentDetail entity={occasion} onClose={() => {}} />)
    expect(screen.getByText("Walked through the cabinet options.")).toBeInTheDocument()
  })

  // Authored prose is never folded; a synced invitation's boilerplate is.
  it("folds a long imported description behind a disclosure", () => {
    const imported = {
      ...MOMENT,
      kind: "occasion",
      source: "imported",
      body: "Join the meeting. ".repeat(20),
    } satisfies Moment
    mount(<MomentDetail entity={imported} onClose={() => {}} />)
    expect(screen.getByText("Details from the invitation")).toBeInTheDocument()
  })
})
