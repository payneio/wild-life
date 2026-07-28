import { afterEach, describe, expect, it } from "vitest"
import { Calendar } from "@fullcalendar/core"
import listPlugin from "@fullcalendar/list"
import { AGENDA_VIEW, asView } from "@/services/calendar/views"

/**
 * The agenda's one promise: it starts on the day you're on and runs forward.
 *
 * It used to be `listMonth`, which lists the calendar month *containing* that
 * day — so on the 27th it opened on the 1st, and Today, which only moves the
 * date inside the month, changed nothing on screen. Both symptoms come from the
 * same missing property, so that property is what's asserted here.
 */
const DAY = 86_400_000
const el = () => document.createElement("div")

let cal: Calendar | undefined
afterEach(() => {
  cal?.destroy()
  cal = undefined
})

function agendaOn(date: Date): Calendar {
  cal = new Calendar(el(), {
    plugins: [listPlugin],
    views: { agenda: AGENDA_VIEW },
    initialView: "agenda",
    initialDate: date,
    headerToolbar: false,
  })
  cal.render()
  return cal
}

describe("the agenda view", () => {
  it("starts on the focused day, not the 1st of its month", () => {
    const view = agendaOn(new Date(2026, 6, 27)).view
    expect(view.activeStart.getDate()).toBe(27)
    expect(view.activeEnd.getTime() - view.activeStart.getTime()).toBe(30 * DAY)
  })

  it("gives Today something to do inside a month it is already showing", () => {
    // The old failure exactly: focused on the 5th, today is the 27th, both in
    // July. `listMonth` showed the same list before and after.
    const c = agendaOn(new Date(2026, 6, 5))
    const before = c.view.activeStart.getTime()
    c.today()
    expect(c.view.activeStart.getTime()).not.toBe(before)
    expect(c.view.activeStart.toDateString()).toBe(new Date().toDateString())
  })

  it("pages forward by its own length rather than by calendar month", () => {
    const c = agendaOn(new Date(2026, 6, 27))
    const start = c.view.activeStart.getTime()
    c.next()
    expect(c.view.activeStart.getTime() - start).toBe(30 * DAY)
  })
})

describe("asView", () => {
  it("carries a persisted list view onto the agenda", () => {
    // Someone who left the calendar on the old Agenda has "listMonth" in
    // localStorage; without this the switcher would highlight nothing.
    expect(asView("listMonth")).toBe("agenda")
    expect(asView("listWeek")).toBe("agenda")
    expect(asView("dayGridMonth")).toBe("dayGridMonth")
  })
})
