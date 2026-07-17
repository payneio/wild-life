import { RRule } from "rrule"

/** Human-readable summary of a bare RRULE string (e.g. "Weekly on Mon"). */
export function summarizeRecurrence(rrule: string | null | undefined): string {
  if (!rrule) return "Does not repeat"
  try {
    const text = RRule.fromString(`RRULE:${rrule}`).toText()
    return text.charAt(0).toUpperCase() + text.slice(1)
  } catch {
    return "Repeats"
  }
}
