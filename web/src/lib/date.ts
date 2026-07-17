// The one date/time module. Two ideas make the UTC-vs-local bug unrepresentable:
//
//  1. Branded types. A CalendarDay ("2026-07-16") and an Instant (a timestamp) are
//     different things the app kept conflating because both were `string`. Branding
//     them means a plain string — or `.slice(0,10)` off a timestamp — no longer
//     satisfies a CalendarDay parameter, so the mistake stops compiling.
//  2. Temporal under the hood. Converting an Instant to a day *requires* naming a
//     timezone (the device zone), so you can never accidentally get the UTC day.
//
// Everything that turns a moment into a day, compares days, formats, or does date
// math goes through here. Brands are plain strings at runtime (zero cost); they're
// asserted for free at the API boundary (apiClient casts JSON to typed interfaces).

import { Temporal } from "temporal-polyfill"

export type CalendarDay = string & { readonly __brand: "CalendarDay" } // "2026-07-16"
export type Instant = string & { readonly __brand: "Instant" } // ISO with offset/Z
export type WallTime = string & { readonly __brand: "WallTime" } // "14:30"

const asDayBrand = (s: string) => s as CalendarDay
const asInstantBrand = (s: string) => s as Instant
const asWallBrand = (s: string) => s as WallTime

/** The device's IANA timezone — what the user means by "my local day". */
const tz = () => Temporal.Now.timeZoneId()

// --- construct --------------------------------------------------------------
export const today = (): CalendarDay => asDayBrand(Temporal.Now.plainDateISO().toString())
export const nowInstant = (): Instant => asInstantBrand(Temporal.Now.instant().toString())
export const nowTime = (): WallTime =>
  asWallBrand(Temporal.Now.plainTimeISO().toString({ smallestUnit: "minute" }))

// --- convert ----------------------------------------------------------------
/** The LOCAL calendar day an instant falls on. This is the whole point: the
 *  conversion goes through the device timezone, never UTC. */
export const dayOf = (i: Instant): CalendarDay =>
  asDayBrand(Temporal.Instant.from(i).toZonedDateTimeISO(tz()).toPlainDate().toString())

/** Coerce an arbitrary date-or-datetime string to a local CalendarDay (bare date
 *  as-is; timestamp via dayOf). For display/diff helpers and migration edges. */
export const asDay = (s: string): CalendarDay =>
  asDayBrand(s.length > 10 ? dayOf(asInstantBrand(s)) : s)

// --- JS Date bridge (FullCalendar / DOM hand us Date objects) ---------------
export const instantOfDate = (d: Date): Instant => asInstantBrand(d.toISOString())
export const dayOfDate = (d: Date): CalendarDay => dayOf(instantOfDate(d))
export const timeOfDate = (d: Date): WallTime =>
  asWallBrand(
    Temporal.Instant.from(d.toISOString())
      .toZonedDateTimeISO(tz())
      .toPlainTime()
      .toString({ smallestUnit: "minute" }),
  )

// --- compare (logic — precise types) ---------------------------------------
export const isToday = (d: CalendarDay): boolean => d === today()
export const isPast = (d: CalendarDay): boolean => Temporal.PlainDate.compare(d, today()) < 0
export const compareDays = (a: CalendarDay, b: CalendarDay): number =>
  Temporal.PlainDate.compare(a, b)

// --- arithmetic -------------------------------------------------------------
export const addDays = (d: CalendarDay, n: number): CalendarDay =>
  asDayBrand(Temporal.PlainDate.from(d).add({ days: n }).toString())

export const dayRange = (start: CalendarDay, count: number): CalendarDay[] => {
  const out: CalendarDay[] = []
  let p = Temporal.PlainDate.from(start)
  for (let i = 0; i < count; i++) {
    out.push(asDayBrand(p.toString()))
    p = p.add({ days: 1 })
  }
  return out
}

/** Signed whole days between two calendar days (negative if `to` is earlier). */
export const daysBetween = (from: CalendarDay, to: CalendarDay): number =>
  Temporal.PlainDate.from(from).until(to, { largestUnit: "day" }).days

/** Whole days from today to `d` (negative = past). Accepts a day or an instant. */
export const daysFromToday = (d: CalendarDay | Instant | null | undefined): number | null =>
  d == null ? null : daysBetween(today(), asDay(d))

// --- format (display — accepts day or instant) ------------------------------
const DAY_OPTS: Intl.DateTimeFormatOptions = { year: "numeric", month: "short", day: "numeric" }

export const formatDay = (
  d: CalendarDay | Instant | null | undefined,
  opts: Intl.DateTimeFormatOptions = DAY_OPTS,
): string => {
  if (!d) return ""
  try {
    return Temporal.PlainDate.from(asDay(d)).toLocaleString(undefined, opts)
  } catch {
    return String(d)
  }
}

export const formatInstant = (
  i: Instant | null | undefined,
  opts?: Intl.DateTimeFormatOptions,
): string => {
  if (!i) return ""
  try {
    return Temporal.Instant.from(i)
      .toZonedDateTimeISO(tz())
      .toLocaleString(undefined, {
        year: "numeric",
        month: "short",
        day: "numeric",
        hour: "numeric",
        minute: "2-digit",
        ...opts,
      })
  } catch {
    return String(i)
  }
}

export const formatTime = (t: WallTime | null | undefined): string => {
  if (!t) return ""
  try {
    return Temporal.PlainTime.from(t).toLocaleString(undefined, {
      hour: "numeric",
      minute: "2-digit",
    })
  } catch {
    return String(t)
  }
}

/** "Today" | "Yesterday" | "Mon, Jul 14" (year shown only if not this year). */
export const dayLabel = (d: CalendarDay | Instant | null | undefined): string => {
  if (!d) return "Undated"
  const cd = asDay(d)
  const t = today()
  if (cd === t) return "Today"
  if (cd === addDays(t, -1)) return "Yesterday"
  const opts: Intl.DateTimeFormatOptions = { weekday: "short", month: "short", day: "numeric" }
  if (cd.slice(0, 4) !== t.slice(0, 4)) opts.year = "numeric"
  return formatDay(cd, opts)
}

// --- form round-trip --------------------------------------------------------
/** Instant → "YYYY-MM-DDTHH:MM" for a <input type=datetime-local> (in local tz). */
export const instantToLocalInput = (i: Instant | null | undefined): string => {
  if (!i) return ""
  try {
    return Temporal.Instant.from(i)
      .toZonedDateTimeISO(tz())
      .toPlainDateTime()
      .toString({ smallestUnit: "minute" })
  } catch {
    return ""
  }
}

/** Local "YYYY-MM-DDTHH:MM" (from datetime-local) → Instant. */
export const localInputToInstant = (s: string): Instant | null => {
  if (!s) return null
  try {
    return asInstantBrand(Temporal.PlainDateTime.from(s).toZonedDateTime(tz()).toInstant().toString())
  } catch {
    return null
  }
}

// --- calendar / RRULE -------------------------------------------------------
/** Instant → RFC-5545 basic-UTC stamp "20260716T140000Z" for an RRULE DTSTART. */
export const rruleDtstart = (i: Instant): string =>
  Temporal.Instant.from(i).toString({ smallestUnit: "second" }).replace(/[-:]/g, "")

// --- back-compat aliases (so correct call sites don't churn) ----------------
export const todayISO = today
export const ymd = (d: Date = new Date()): CalendarDay => dayOfDate(d)
export const localDay = asDay
export const isOverdue = (d: CalendarDay | null | undefined): boolean => !!d && isPast(d)
export const formatDate = formatDay
export const formatDateTime = formatInstant
export const shiftDays = (n: number, from?: CalendarDay | null): CalendarDay =>
  addDays(from ?? today(), n)
