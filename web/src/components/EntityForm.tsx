import { useMemo, useState } from "react"
import { Button, Field, Input, Select, Textarea } from "@/components/ui/primitives"
import {
  useAreaLookup,
  useGoalLookup,
  useMetricLookup,
  usePeopleLookup,
  useProgramLookup,
  useProjectLookup,
  type LookupKey,
  type Option,
} from "@/services/api/lookups"

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

export interface FieldSpec {
  name: string
  label: string
  type?: FieldType
  options?: readonly string[]
  lookup?: LookupKey
  full?: boolean
  placeholder?: string
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
  const raw = initial?.[f.name]
  if (f.type === "checkbox") return !!raw
  if (f.type === "tags") return Array.isArray(raw) ? (raw as string[]).join(", ") : ""
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
  const lookups: Record<LookupKey, { options: Option[] }> = {
    area: useAreaLookup(),
    program: useProgramLookup(),
    project: useProjectLookup(),
    people: usePeopleLookup(),
    goal: useGoalLookup(),
    metric: useMetricLookup(),
  }

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
      className="grid grid-cols-2 gap-3"
      onSubmit={(e) => {
        e.preventDefault()
        submit()
      }}
    >
      {fields.map((f) => {
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
              const opts = f.lookup ? lookups[f.lookup].options : []
              return (
                <Select value={String(val ?? "")} onChange={(e) => set(f.name, e.target.value)}>
                  <option value="">—</option>
                  {opts.map((o) => (
                    <option key={o.id} value={o.id}>
                      {o.label}
                    </option>
                  ))}
                </Select>
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
              className="col-span-2 flex items-center gap-2 text-sm text-slate-600"
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
            className={f.full || f.type === "textarea" ? "col-span-2" : ""}
          >
            {control()}
          </Field>
        )
      })}
      <div className="col-span-2 mt-2 flex justify-end gap-2">
        <Button type="button" variant="secondary" onClick={onCancel}>
          Cancel
        </Button>
        <Button type="submit">{submitLabel}</Button>
      </div>
    </form>
  )
}
