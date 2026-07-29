/**
 * How often a new occasion repeats, in our own vocabulary.
 *
 * Two families, because a cadence is one or the other (see `rules.is_due`):
 * **striding** through days and weeks, or **selecting** a position in the
 * calendar. "Every 3 days, on the first Saturday" is two cadences arguing, so
 * the picker makes you choose one.
 *
 * Lives apart from the control so the constants can be shared without breaking
 * fast refresh, which only works when a module exports components alone.
 */
export type RepeatMode = "none" | "daily" | "weekly" | "monthly" | "yearly"

export interface Repeat {
  mode: RepeatMode
  /** Weekly: which days. Monthly by weekday: which one. */
  days: string[]
  /** Daily: every N days. Weekly: every N weeks. */
  every: number
  /** Monthly: 1–5, or −1 for the last such weekday. Null = on a date instead. */
  weekOfMonth: number | null
  until: string
}

export const NO_REPEAT: Repeat = {
  mode: "none",
  days: [],
  every: 1,
  weekOfMonth: 1,
  until: "",
}

/** What the rule's cadence columns should hold for this repeat, given the day
 *  the occasion was dragged onto. Mirrors `recurrence.translate` on the API
 *  side — the same little algebra, arrived at from the other direction. */
export function cadenceFor(
  repeat: Repeat,
  start: Date,
): {
  days_of_week: string[]
  interval_days: number
  months: number[]
  day_of_month: number | null
  week_of_month: number | null
} | null {
  const WEEK = ["mon", "tue", "wed", "thu", "fri", "sat", "sun"]
  const weekday = WEEK[(start.getDay() + 6) % 7]
  switch (repeat.mode) {
    case "none":
      return null
    case "daily":
      return {
        days_of_week: [],
        interval_days: Math.max(1, repeat.every),
        months: [],
        day_of_month: null,
        week_of_month: null,
      }
    case "weekly":
      return {
        days_of_week: repeat.days.length ? repeat.days : [weekday],
        interval_days: repeat.every <= 1 ? 1 : repeat.every * 7,
        months: [],
        day_of_month: null,
        week_of_month: null,
      }
    case "monthly":
      return repeat.weekOfMonth === null
        ? {
            days_of_week: [],
            interval_days: 1,
            months: [],
            day_of_month: start.getDate(),
            week_of_month: null,
          }
        : {
            days_of_week: [weekday],
            interval_days: 1,
            months: [],
            day_of_month: null,
            week_of_month: repeat.weekOfMonth,
          }
    case "yearly":
      // A birthday or a holiday: the month and the date come from the day you
      // dragged onto, exactly as a bare FREQ=YEARLY takes them from DTSTART.
      return {
        days_of_week: [],
        interval_days: 1,
        months: [start.getMonth() + 1],
        day_of_month: start.getDate(),
        week_of_month: null,
      }
  }
}
