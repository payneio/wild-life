/**
 * The shared postal-address vocabulary, client side.
 *
 * Mirrors `schemas/common.PostalAddress` on the API: the components vCard's
 * `ADR` (RFC 6350) and schema.org's `PostalAddress` agree on. Kept in one place
 * so the three carriers — Location's columns, Organization's columns, and the
 * objects in a Person's `addresses` list — render and flatten identically.
 */

export interface PostalAddress {
  street?: string | null
  /** Apartment, suite, floor — vCard's "extended address". */
  unit?: string | null
  city?: string | null
  /** State, province or county: the standard's own deliberately-vague name. */
  region?: string | null
  postcode?: string | null
  country?: string | null
}

export interface LabelledAddress extends PostalAddress {
  label?: string | null
}

/** Flatten to one line — for map links, list cells, and anywhere a string is all
 *  there is room for. */
export function formatAddress(
  address: PostalAddress | Record<string, unknown>,
  sep = ", ",
): string {
  const get = (k: string) => {
    const v = (address as Record<string, unknown>)[k]
    return typeof v === "string" && v.trim() ? v.trim() : null
  }
  const street = [get("street"), get("unit")].filter(Boolean).join(" ")
  return [street, get("city"), get("region"), get("postcode"), get("country")]
    .filter(Boolean)
    .join(sep)
}

/** True when every component is empty — an address that exists but says nothing. */
export function isAddressEmpty(address: PostalAddress): boolean {
  return formatAddress(address) === ""
}
