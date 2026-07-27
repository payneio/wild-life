import { render, screen } from "@testing-library/react"
import { MemoryRouter } from "react-router-dom"
import { describe, expect, it } from "vitest"
import { MentionText } from "@/components/MentionText"

const show = (md: string) =>
  render(
    <MemoryRouter>
      <MentionText>{md}</MentionText>
    </MemoryRouter>,
  )

describe("MentionText links", () => {
  // Event descriptions come from whoever emailed the invite, so an href here is
  // untrusted input, not something the user typed.
  it.each([
    ["javascript:alert(1)", "javascript"],
    ["data:text/html;base64,PHNjcmlwdD4=", "data"],
    ["vbscript:msgbox(1)", "vbscript"],
  ])("drops a %s href", (href) => {
    show(`[Join now](${href})`)
    const link = screen.getByText("Join now").closest("a")
    // Either unlinked entirely or stripped of the dangerous target — never
    // carrying the scheme through to the DOM.
    expect(link?.getAttribute("href") ?? "").not.toMatch(/javascript:|data:|vbscript:/i)
  })

  it("keeps ordinary web, mail and phone links", () => {
    show(
      "[meet](https://meet.google.com/abc-defg-hij) [mail](mailto:a@b.com) [call](tel:+12065550100)",
    )
    expect(screen.getByText("meet").closest("a")).toHaveAttribute(
      "href",
      "https://meet.google.com/abc-defg-hij",
    )
    expect(screen.getByText("mail").closest("a")).toHaveAttribute("href", "mailto:a@b.com")
    expect(screen.getByText("call").closest("a")).toHaveAttribute("href", "tel:+12065550100")
  })

  it("still renders an @-mention as a chip", () => {
    // The allow-list exists so the internal `type:uuid` form survives sanitizing
    // — that is why urlTransform could not simply be react-markdown's default.
    show("[@Alice](person:3f1a2b3c-4d5e-6f70-8192-a3b4c5d6e7f8)")
    const chip = screen.getByRole("link")
    expect(chip).toHaveAttribute("href", "/people/3f1a2b3c-4d5e-6f70-8192-a3b4c5d6e7f8")
    expect(chip).toHaveTextContent("Alice")
  })

  it("renders a GFM table, so an invite schedule keeps its grid", () => {
    show(["| When | What |", "| --- | --- |", "| 4 - 9 p.m. | Activity Booths |"].join("\n"))
    expect(screen.getByRole("table")).toBeInTheDocument()
    expect(screen.getByRole("cell", { name: "Activity Booths" })).toBeInTheDocument()
  })

  it("renders an autolink, the shape the ICS converter emits", () => {
    show("Join: <https://teams.microsoft.com/meet/274>")
    expect(screen.getByRole("link")).toHaveAttribute(
      "href",
      "https://teams.microsoft.com/meet/274",
    )
  })
})
