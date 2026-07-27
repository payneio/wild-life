import { Plus, X } from "lucide-react"
import { Input } from "@/components/ui/primitives"
import type { LabelledAddress } from "@/lib/address"

/**
 * A person's addresses, in the shared postal vocabulary.
 *
 * Addresses used to ride along with phones and emails in `MethodRows`, because
 * all three were `{value, label}` — an address was one opaque string. That is
 * why they now need their own editor: a street, unit, city, region, postcode and
 * country do not fit in a single input, and cramming them there is exactly what
 * made entering an address awkward.
 *
 * Phones and emails keep `MethodRows`; they really are one value plus a label.
 */

const BLANK: LabelledAddress = { label: null, street: null }

export function AddressRows({
  rows,
  onChange,
}: {
  rows: LabelledAddress[]
  onChange: (rows: LabelledAddress[]) => void
}) {
  const set = (i: number, patch: Partial<LabelledAddress>) =>
    onChange(rows.map((r, j) => (j === i ? { ...r, ...patch } : r)))

  return (
    <div className="col-span-2">
      <div className="mb-1 flex items-center justify-between">
        <span className="text-sm font-medium text-slate-600">Addresses</span>
        <button
          type="button"
          className="flex items-center gap-1 text-xs text-indigo-600 hover:text-indigo-800"
          onClick={() => onChange([...rows, { ...BLANK }])}
        >
          <Plus size={13} /> Add
        </button>
      </div>

      <div className="space-y-3">
        {rows.map((row, i) => (
          <div
            key={i}
            className="rounded border border-slate-200 p-2 dark:border-stone-700"
          >
            <div className="mb-1.5 flex gap-1.5">
              <Input
                className="w-28"
                value={row.label ?? ""}
                placeholder="home"
                onChange={(e) => set(i, { label: e.target.value || null })}
              />
              <div className="flex-1" />
              <button
                type="button"
                aria-label="Remove address"
                className="rounded px-1.5 text-slate-400 hover:bg-slate-100 hover:text-slate-600"
                onClick={() => onChange(rows.filter((_, j) => j !== i))}
              >
                <X size={14} />
              </button>
            </div>
            <div className="grid grid-cols-6 gap-1.5">
              <Input
                className="col-span-4"
                value={row.street ?? ""}
                placeholder="Street"
                onChange={(e) => set(i, { street: e.target.value || null })}
              />
              <Input
                className="col-span-2"
                value={row.unit ?? ""}
                placeholder="Unit"
                onChange={(e) => set(i, { unit: e.target.value || null })}
              />
              <Input
                className="col-span-3"
                value={row.city ?? ""}
                placeholder="City"
                onChange={(e) => set(i, { city: e.target.value || null })}
              />
              <Input
                className="col-span-1"
                value={row.region ?? ""}
                placeholder="State"
                onChange={(e) => set(i, { region: e.target.value || null })}
              />
              <Input
                className="col-span-2"
                value={row.postcode ?? ""}
                placeholder="Postcode"
                onChange={(e) => set(i, { postcode: e.target.value || null })}
              />
              <Input
                className="col-span-6"
                value={row.country ?? ""}
                placeholder="Country"
                onChange={(e) => set(i, { country: e.target.value || null })}
              />
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}
