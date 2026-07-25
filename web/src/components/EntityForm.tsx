import { useMemo, useState } from "react"
import { Button, Field, Input, Select, Textarea } from "@/components/ui/primitives"
import { RecurrenceEditor } from "@/components/RecurrenceEditor"
import { AttendeeEditor } from "@/components/calendar/AttendeeEditor"
import { EntityRefField } from "@/components/graph/EntityRefField"
import { cn } from "@/lib/utils"
import type { LookupKey } from "@/services/api/lookups"

export type FieldType =
  | "text"
  | "textarea"
  | "number"
  | "date"
  | "datetime"
  | "checkbox"
  | "select"
  | "entity"
  | "tags"
  | "attendees"
  | "multiselect"
  | "time"
  | "recurrence"

export interface FieldSpec {
  name: string
  label: string
  type?: FieldType
  options?: readonly string[]
  lookup?: LookupKey
  full?: boolean
  placeholder?: string
  /** Seed value when creating (no `initial`) — e.g. a required select's default,
   * so it never submits a blank/null the backend rejects. */
  default?: unknown
  /** Show this field only when the predicate (over the current values) holds. */
  visibleWhen?: (values: Record<string, unknown>) => boolean
}

type Values = Record<string, unknown>

function toLocalInput(iso: unknown): string {
  if (typeof iso !== "string" || !iso) return ""
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return ""
  const pad = (n: number) => String(n).padStart(2, "0")
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`
}

function initialValue(f: FieldSpec, initial?: Values): unknown {
  const raw = initial?.[f.name] ?? (initial ? undefined : f.default)
  if (f.type === "checkbox") return !!raw
  if (f.type === "tags") return Array.isArray(raw) ? (raw as string[]).join(", ") : ""
  if (f.type === "attendees") return Array.isArray(raw) ? (raw as string[]) : []
  if (f.type === "multiselect") return Array.isArray(raw) ? (raw as string[]) : []
  if (f.type === "datetime") return toLocalInput(raw)
  return raw == null ? "" : raw
}

export function EntityForm({
  fields,
  initial,
  onSubmit,
  onCancel,
  submitLabel = "Save",
}: {
  fields: FieldSpec[]
  initial?: object
  onSubmit: (body: Values) => void
  onCancel: () => void
  submitLabel?: string
}) {
  const init = initial as Values | undefined

  const [values, setValues] = useState<Values>(() => {
    const v: Values = {}
    for (const f of fields) v[f.name] = initialValue(f, init)
    return v
  })

  const set = (name: string, value: unknown) =>
    setValues((prev) => ({ ...prev, [name]: value }))

  const body = useMemo(() => values, [values])

  function submit() {
    const out: Values = {}
    for (const f of fields) {
      const v = body[f.name]
      if (f.type === "number") {
        out[f.name] = v === "" || v == null ? null : Number(v)
      } else if (f.type === "checkbox") {
        out[f.name] = !!v
      } else if (f.type === "tags") {
        out[f.name] = String(v ?? "")
          .split(",")
          .map((s) => s.trim())
          .filter(Boolean)
      } else if (f.type === "attendees") {
        out[f.name] = Array.isArray(v) ? v : []
      } else if (f.type === "multiselect") {
        out[f.name] = Array.isArray(v) ? v : []
      } else if (f.type === "datetime") {
        out[f.name] = v ? new Date(String(v)).toISOString() : null
      } else if (v === "") {
        out[f.name] = null
      } else {
        out[f.name] = v
      }
    }
    onSubmit(out)
  }

  return (
    <form
      className="grid grid-cols-1 gap-3 sm:grid-cols-2"
      onSubmit={(e) => {
        e.preventDefault()
        submit()
      }}
    >
      {fields.map((f) => {
        if (f.visibleWhen && !f.visibleWhen(body)) return null
        const val = body[f.name]
        const control = () => {
          switch (f.type) {
            case "textarea":
              return (
                <Textarea
                  value={String(val ?? "")}
                  placeholder={f.placeholder}
                  onChange={(e) => set(f.name, e.target.value)}
                />
              )
            case "checkbox":
              return (
                <input
                  type="checkbox"
                  className="h-4 w-4"
                  checked={!!val}
                  onChange={(e) => set(f.name, e.target.checked)}
                />
              )
            case "number":
              return (
                <Input
                  type="number"
                  value={val === null || val === undefined ? "" : String(val)}
                  placeholder={f.placeholder}
                  onChange={(e) => set(f.name, e.target.value)}
                />
              )
            case "date":
              return (
                <Input
                  type="date"
                  value={String(val ?? "")}
                  onChange={(e) => set(f.name, e.target.value)}
                />
              )
            case "time":
              return (
                <Input
                  type="time"
                  value={String(val ?? "").slice(0, 5)}
                  onChange={(e) => set(f.name, e.target.value)}
                />
              )
            case "datetime":
              return (
                <Input
                  type="datetime-local"
                  value={String(val ?? "")}
                  onChange={(e) => set(f.name, e.target.value)}
                />
              )
            case "select":
              return (
                <Select value={String(val ?? "")} onChange={(e) => set(f.name, e.target.value)}>
                  <option value="">—</option>
                  {(f.options ?? []).map((o) => (
                    <option key={o} value={o}>
                      {o.replace(/_/g, " ")}
                    </option>
                  ))}
                </Select>
              )
            case "entity": {
              if (!f.lookup) return null
              return (
                <EntityRefField
                  lookup={f.lookup}
                  value={val ? String(val) : null}
                  onChange={(id) => set(f.name, id ?? "")}
                />
              )
            }
            case "tags":
              return (
                <Input
                  value={String(val ?? "")}
                  placeholder="comma, separated"
                  onChange={(e) => set(f.name, e.target.value)}
                />
              )
            case "attendees":
              return (
                <AttendeeEditor
                  value={Array.isArray(val) ? (val as string[]) : []}
                  onChange={(next) => set(f.name, next)}
                />
              )
            case "multiselect": {
              const selected = Array.isArray(val) ? (val as string[]) : []
              // Show the fixed options plus any already-set value outside them
              // (e.g. a legacy slot) so editing never silently drops it.
              const opts = [
                ...(f.options ?? []),
                ...selected.filter((s) => !(f.options ?? []).includes(s)),
              ]
              const toggle = (o: string) =>
                set(
                  f.name,
                  selected.includes(o)
                    ? selected.filter((x) => x !== o)
                    : [...selected, o],
                )
              return (
                <div className="flex flex-wrap gap-1.5">
                  {opts.map((o) => {
                    const on = selected.includes(o)
                    return (
                      <button
                        key={o}
                        type="button"
                        onClick={() => toggle(o)}
                        className={cn(
                          "rounded-full border px-2.5 py-1 text-xs capitalize transition-colors",
                          on
                            ? "border-indigo-600 bg-indigo-600 text-on-accent"
                            : "border-slate-300 text-slate-600 hover:border-slate-400",
                        )}
                      >
                        {o}
                      </button>
                    )
                  })}
                </div>
              )
            }
            case "recurrence":
              return (
                <RecurrenceEditor
                  value={String(val ?? "")}
                  onChange={(v) => set(f.name, v)}
                />
              )
            default:
              return (
                <Input
                  value={String(val ?? "")}
                  placeholder={f.placeholder}
                  onChange={(e) => set(f.name, e.target.value)}
                />
              )
          }
        }
        if (f.type === "checkbox") {
          return (
            <label
              key={f.name}
              className="flex items-center gap-2 text-sm text-slate-600 sm:col-span-2"
            >
              {control()}
              <span className="font-medium">{f.label}</span>
            </label>
          )
        }
        return (
          <Field
            key={f.name}
            label={f.label}
            className={
              f.full || f.type === "textarea" || f.type === "recurrence"
                ? "sm:col-span-2"
                : ""
            }
          >
            {control()}
          </Field>
        )
      })}
      <div className="mt-2 flex justify-end gap-2 sm:col-span-2">
        <Button type="button" variant="secondary" onClick={onCancel}>
          Cancel
        </Button>
        <Button type="submit">{submitLabel}</Button>
      </div>
    </form>
  )
}
