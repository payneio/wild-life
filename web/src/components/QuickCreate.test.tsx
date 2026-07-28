import { fireEvent, render, screen } from "@testing-library/react"
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

  it("commits when the keyboard submits instead of sending Enter", async () => {
    const user = userEvent.setup()
    const onCreate = vi.fn()
    render(<QuickCreate placeholder="Add…" onCreate={onCreate} />)

    const input = screen.getByPlaceholderText("Add…")
    await user.type(input, "Rifaximin")

    // What a phone keyboard with autocorrect on actually sends for return: a
    // composition keydown, not Enter. Nothing to hang a commit on — which is why
    // capture on mobile did nothing at all before this was a form.
    fireEvent.keyDown(input, { key: "Unidentified", keyCode: 229, which: 229 })
    expect(onCreate).not.toHaveBeenCalled()

    fireEvent.submit(input.closest("form")!)
    expect(onCreate).toHaveBeenCalledWith("Rifaximin")
    expect(input).toHaveValue("")
  })

  it("offers a button to commit with, once there is something to commit", async () => {
    const user = userEvent.setup()
    const onCreate = vi.fn()
    render(<QuickCreate placeholder="Add…" onCreate={onCreate} />)

    // No text, nothing to press — the field alone is the whole affordance.
    expect(screen.queryByRole("button", { name: "Add" })).toBeNull()

    const input = screen.getByPlaceholderText("Add…")
    await user.type(input, "Rifaximin")
    await user.click(screen.getByRole("button", { name: "Add" }))
    expect(onCreate).toHaveBeenCalledWith("Rifaximin")
    expect(screen.queryByRole("button", { name: "Add" })).toBeNull()
  })

  it("leaves a composing IME alone", async () => {
    const user = userEvent.setup()
    const onCreate = vi.fn()
    render(<QuickCreate placeholder="Add…" onCreate={onCreate} />)

    const input = screen.getByPlaceholderText("Add…")
    await user.type(input, "にほん")
    // Enter here picks a candidate; it is not a commit of the row.
    fireEvent.keyDown(input, { key: "Enter", isComposing: true })
    expect(onCreate).not.toHaveBeenCalled()
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
