// The canonical times-of-day a dose can be taken, in daily order. Shared by the
// dose-line editors (as selectable chips) and Today's rhythms (for ordering).
export const SLOTS = [
  "wake",
  "breakfast",
  "morning",
  "lunch",
  "afternoon",
  "dinner",
  "evening",
  "bedtime",
] as const

export const slotRank = (s: string): number => {
  const i = (SLOTS as readonly string[]).indexOf(s)
  return i === -1 ? 99 : i
}

// Cadence across days (FHIR dayOfWeek). Empty selection on a dose line = daily.
export const WEEKDAYS = ["mon", "tue", "wed", "thu", "fri", "sat", "sun"] as const
