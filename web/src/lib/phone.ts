/**
 * Phone display, via `libphonenumber-js` — the JS port of the same Google
 * library the API normalises with (`api/src/wild_life/phone.py`), so the stored
 * form and the displayed form cannot disagree about what a number is.
 *
 * Storage is E.164 (`+12063996403`); this is the other half of that split — one
 * canonical stored form, one display form, the same shape dates already use.
 *
 * The governing rule is **never mangle what doesn't parse**: a partial number
 * mid-typing, free text, or anything the library rejects comes back unchanged.
 */
import {
  AsYouType,
  parsePhoneNumberFromString,
  type CountryCode,
} from "libphonenumber-js"

/** The country assumed for a number typed without one. */
export const DEFAULT_COUNTRY: CountryCode = "US"

/** Digits only — the comparable form, used for search matching. */
export function phoneDigits(raw: string | null | undefined): string {
  return (raw ?? "").replace(/\D/g, "")
}

/**
 * A stored number in its display form: `(206) 399-6403` at home, and the
 * international form (`+44 20 7946 0958`) for anywhere else — so a foreign
 * number never reads as if it were local. Unparseable input is returned as
 * given.
 */
export function formatPhone(raw: string | null | undefined): string {
  const text = (raw ?? "").trim()
  if (!text) return ""
  const parsed = parsePhoneNumberFromString(text, DEFAULT_COUNTRY)
  if (!parsed || !parsed.isValid()) return text
  const base =
    parsed.country === DEFAULT_COUNTRY ? parsed.formatNational() : parsed.formatInternational()
  return parsed.ext ? `${base} ext. ${parsed.ext}` : base
}

/**
 * E.164 for storage, matching the API's normalisation exactly. The API is still
 * the authority — this only spares the UI a round-trip before it can show the
 * number the way it will be stored.
 */
export function toE164(raw: string | null | undefined): string {
  const text = (raw ?? "").trim()
  if (!text) return ""
  const parsed = parsePhoneNumberFromString(text, DEFAULT_COUNTRY)
  if (!parsed || !parsed.isValid()) return text
  return parsed.ext ? `${parsed.number} ext. ${parsed.ext}` : parsed.number
}

/**
 * Progressive formatting while typing — `206` → `(206)` → `(206) 399-6`. Used for
 * the live input value, where `formatPhone` would refuse (a partial number isn't
 * valid yet) and leave the field looking raw until the moment it completes.
 *
 * Reformats only when the text grew. Reformatting on delete is the classic
 * as-you-type bug: backspace over the `)` in `(206)`, the formatter puts it
 * straight back, and the caret can never get past it. Deleting therefore leaves
 * the text exactly as the user left it.
 */
export function formatWhileTyping(next: string, prev: string): string {
  if (next.length < prev.length) return next
  return new AsYouType(DEFAULT_COUNTRY).input(next)
}
