/** The calendar's views: what the switcher offers, and how the agenda is built. */

export type ViewType = "dayGridMonth" | "timeGridWeek" | "timeGridDay" | "agenda"

export const VIEWS: { value: ViewType; label: string }[] = [
  { value: "dayGridMonth", label: "Month" },
  { value: "timeGridWeek", label: "Week" },
  { value: "timeGridDay", label: "Day" },
  { value: "agenda", label: "Agenda" },
]

export const AGENDA_DAYS = 30

/**
 * The agenda is a *rolling* 30 days from the day you're on — not FullCalendar's
 * `listMonth`, which lists the calendar month *containing* that day.
 *
 * A month-shaped list answers "what happened in July", which is a question the
 * grid already answers better; what you open an agenda for is "what's coming",
 * and on the 27th a list starting on the 1st is three quarters spent. Anchoring
 * on the day also gives Today something to do — inside `listMonth` it moved the
 * date within the same month, so the list never changed.
 */
export const AGENDA_VIEW = {
  type: "list",
  duration: { days: AGENDA_DAYS },
  // The weekday reads on the row itself, so the repeat FullCalendar puts on the
  // right of every heading is just noise.
  listDayFormat: { weekday: "long" as const, month: "short" as const, day: "numeric" as const },
  listDaySideFormat: false as const,
}

/** Persisted view names from before the rolling agenda. */
export const asView = (v: string): ViewType =>
  v === "listMonth" || v === "listWeek" || v === "listDay" ? "agenda" : (v as ViewType)
