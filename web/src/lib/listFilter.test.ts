import { act, renderHook } from "@testing-library/react"
import { beforeEach, describe, expect, it } from "vitest"
import { useListFilter, type ListConfig } from "@/lib/listFilter"

const CONFIG: ListConfig = {
  searchKeys: ["name"],
  filters: [{ field: "status", label: "Status", options: ["active", "archived"] }],
  sorts: [{ key: "az", label: "A–Z", field: "name" }],
}

const ROWS = [
  { id: "1", name: "Live one", status: "active" },
  { id: "2", name: "Live two", status: "proposed" },
  { id: "3", name: "Done", status: "completed" },
  { id: "4", name: "Filed away", status: "archived" },
]

const names = (rows: Record<string, unknown>[]) => rows.map((r) => r.name)

beforeEach(() => localStorage.clear())

describe("useListFilter — finished rows", () => {
  it("hides finished rows by default and says how many", () => {
    const { result } = renderHook(() => useListFilter(ROWS, CONFIG, undefined, "project"))
    expect(names(result.current.filtered)).toEqual(["Live one", "Live two"])
    expect(result.current.closedCount).toBe(2)
    expect(result.current.toolbarProps.closed).toMatchObject({ count: 2, showing: false })
  })

  it("reveals them on request", () => {
    const { result } = renderHook(() => useListFilter(ROWS, CONFIG, undefined, "project"))
    act(() => result.current.toolbarProps.closed!.onToggle())
    expect(names(result.current.filtered)).toHaveLength(4)
    expect(result.current.closedCount).toBe(0)
  })

  it("lets an explicit status choice outrank the default", () => {
    // Otherwise picking "archived" from the dropdown would return nothing —
    // the same silent lie, moved somewhere else.
    const { result } = renderHook(() => useListFilter(ROWS, CONFIG, undefined, "project"))
    act(() => result.current.toolbarProps.onFilter("status", "archived"))
    expect(names(result.current.filtered)).toEqual(["Filed away"])
  })

  it("does nothing for a type with no lifecycle", () => {
    const { result } = renderHook(() => useListFilter(ROWS, CONFIG, undefined, "person"))
    expect(result.current.filtered).toHaveLength(4)
    expect(result.current.toolbarProps.closed).toBeUndefined()
  })

  it("is inert when no entity type is given", () => {
    const { result } = renderHook(() => useListFilter(ROWS, CONFIG))
    expect(result.current.filtered).toHaveLength(4)
  })
})
