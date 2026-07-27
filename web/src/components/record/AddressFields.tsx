import { MapPin, Wand2 } from "lucide-react"
import { useState } from "react"
import { useFields } from "@/components/record/context"
import { apiClient } from "@/services/api/client"
import { formatAddress } from "@/lib/address"

/**
 * One address, in the shared vocabulary.
 *
 * The components are vCard's `ADR` (RFC 6350) and schema.org's `PostalAddress`,
 * which agree: street, unit, city, region, postcode, country. `region` is the
 * standard's own name and is deliberately vague — a state in the US, a province
 * in Canada, a county in the UK.
 *
 * `unit` is the field whose absence used to make this awkward: an apartment or
 * suite number had nowhere to go but the street line.
 */

const FIELDS = ["street", "unit", "city", "region", "postcode", "country"] as const

function Input({
  field,
  label,
  value,
  onSave,
  className = "",
}: {
  field: string
  label: string
  value: string
  onSave: (v: string) => void
  className?: string
}) {
  const [draft, setDraft] = useState(value)
  const [focused, setFocused] = useState(false)
  return (
    <label className={`block ${className}`}>
      <span className="mb-0.5 block text-xs font-medium text-stone-500 dark:text-stone-400">
        {label}
      </span>
      <input
        value={focused ? draft : value}
        onFocus={() => {
          setDraft(value)
          setFocused(true)
        }}
        onChange={(e) => setDraft(e.target.value)}
        onBlur={() => {
          setFocused(false)
          if (draft !== value) onSave(draft)
        }}
        onKeyDown={(e) => {
          if (e.key === "Enter") e.currentTarget.blur()
        }}
        name={field}
        className="w-full rounded border border-stone-300 bg-transparent px-2 py-1 text-sm dark:border-stone-600"
      />
    </label>
  )
}

export function AddressFields({
  /** When set, offers a one-press fill from the record's coordinates. */
  lookupPath,
}: {
  lookupPath?: string
}) {
  const { row, save } = useFields(FIELDS)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const get = (f: string) => (row[f] as string | null) ?? ""
  const placed = row.latitude != null && row.longitude != null
  const written = formatAddress(row)

  async function lookup() {
    if (!lookupPath) return
    setBusy(true)
    setError(null)
    try {
      // Fills blanks only, so pressing it cannot quietly overwrite a correction.
      await apiClient.post(lookupPath, {})
    } catch {
      setError("Couldn't look that up. Type it in, or try again.")
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="space-y-2 sm:col-span-2">
      <div className="grid gap-2 sm:grid-cols-6">
        <Input
          field="street"
          label="Street"
          value={get("street")}
          onSave={(v) => save({ street: v || null })}
          className="sm:col-span-4"
        />
        <Input
          field="unit"
          label="Unit"
          value={get("unit")}
          onSave={(v) => save({ unit: v || null })}
          className="sm:col-span-2"
        />
        <Input
          field="city"
          label="City"
          value={get("city")}
          onSave={(v) => save({ city: v || null })}
          className="sm:col-span-3"
        />
        <Input
          field="region"
          label="State / Province"
          value={get("region")}
          onSave={(v) => save({ region: v || null })}
          className="sm:col-span-1"
        />
        <Input
          field="postcode"
          label="Postcode"
          value={get("postcode")}
          onSave={(v) => save({ postcode: v || null })}
          className="sm:col-span-2"
        />
        <Input
          field="country"
          label="Country"
          value={get("country")}
          onSave={(v) => save({ country: v || null })}
          className="sm:col-span-3"
        />
      </div>

      <div className="flex flex-wrap items-center gap-3">
        {lookupPath && (
          <button
            onClick={lookup}
            disabled={busy || !placed}
            title={
              placed
                ? "Fill the blanks from the pin's coordinates"
                : "Place the pin on the map first"
            }
            className="inline-flex items-center gap-1.5 rounded border border-stone-300 px-2 py-1 text-xs font-medium hover:bg-stone-50 disabled:opacity-40 dark:border-stone-600 dark:hover:bg-stone-800"
          >
            <Wand2 size={13} /> {busy ? "Looking up…" : "Look up address"}
          </button>
        )}
        {written && (
          <a
            href={`https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(written)}`}
            target="_blank"
            rel="noreferrer"
            className="inline-flex items-center gap-1.5 text-xs font-medium text-indigo-600 hover:underline"
          >
            <MapPin size={13} /> Open in Maps
          </a>
        )}
      </div>
      {error && <p className="text-xs text-amber-600 dark:text-amber-400">{error}</p>}
    </div>
  )
}
