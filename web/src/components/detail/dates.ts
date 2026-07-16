/** Date helpers shared by the bespoke detail views (kept out of the component
 *  module so react-refresh stays happy). All dates are ISO `YYYY-MM-DD`. */

export function todayISO(): string {
  return new Date().toISOString().slice(0, 10)
}

export function shiftDays(days: number, from?: string | null): string {
  const base = from ? new Date(`${from}T00:00:00`) : new Date(`${todayISO()}T00:00:00`)
  base.setDate(base.getDate() + days)
  return base.toISOString().slice(0, 10)
}

/** Whole days from today to `date` (negative = past). null if no date. */
export function daysFromToday(date: string | null | undefined): number | null {
  if (!date) return null
  const a = new Date(`${todayISO()}T00:00:00`).getTime()
  const b = new Date(`${date.slice(0, 10)}T00:00:00`).getTime()
  return Math.round((b - a) / 86_400_000)
}
