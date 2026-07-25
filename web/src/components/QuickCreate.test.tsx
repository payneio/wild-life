import { render, screen } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { describe, expect, it, vi } from "vitest"
import { QuickCreate } from "@/components/QuickCreate"

describe("QuickCreate", () => {
  it("creates on Enter and stays ready for the next one", async () => {
    const user = userEvent.setup()
    const onCreate = vi.fn()
    render(<QuickCreate placeholder="Add a task…" onCreate={onCreate} />)

    const input = screen.getByPlaceholderText("Add a task…")
    await user.type(input, "Renew the passport{Enter}")
    expect(onCreate).toHaveBeenCalledWith("Renew the passport")

    // Cleared and still focused, so a run of items can be typed without reaching
    // for the mouse — the whole point of capture over form-filling.
    expect(input).toHaveValue("")
    expect(input).toHaveFocus()

    await user.type(input, "Book the dentist{Enter}")
    expect(onCreate).toHaveBeenCalledWith("Book the dentist")
    expect(onCreate).toHaveBeenCalledTimes(2)
  })

  it("creates nothing from empty or whitespace input", async () => {
    const user = userEvent.setup()
    const onCreate = vi.fn()
    render(<QuickCreate placeholder="Add…" onCreate={onCreate} />)

    const input = screen.getByPlaceholderText("Add…")
    await user.type(input, "{Enter}")
    await user.type(input, "   {Enter}")
    // This is what keeps "modeless create leaves stray rows" from being true.
    expect(onCreate).not.toHaveBeenCalled()
  })

  it("keeps the text when the caller rejects the commit", async () => {
    const user = userEvent.setup()
    // e.g. a delegation whose responsible person hasn't been picked yet.
    const onCreate = vi.fn(() => false as const)
    render(<QuickCreate placeholder="Delegate…" onCreate={onCreate} />)

    const input = screen.getByPlaceholderText("Delegate…")
    await user.type(input, "Draft the brief{Enter}")
    expect(onCreate).toHaveBeenCalled()
    expect(input).toHaveValue("Draft the brief")
  })

  it("discards the draft on Escape", async () => {
    const user = userEvent.setup()
    const onCreate = vi.fn()
    render(<QuickCreate placeholder="Add…" onCreate={onCreate} />)

    const input = screen.getByPlaceholderText("Add…")
    await user.type(input, "never mind{Escape}")
    expect(input).toHaveValue("")
    expect(onCreate).not.toHaveBeenCalled()
  })
})
