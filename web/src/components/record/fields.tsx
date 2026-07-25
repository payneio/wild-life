import { useLayoutEffect, useRef, useState, type ReactNode } from "react"
import { EntityRefField } from "@/components/graph/EntityRefField"
import { RecurrenceEditor } from "@/components/RecurrenceEditor"
import { NoteRootField } from "@/components/graph/NoteRootField"
import { AttendeeEditor } from "@/components/calendar/AttendeeEditor"
import { useField, useFields } from "@/components/record/context"
import { instantToLocalInput, localInputToInstant } from "@/lib/date"
import { cn } from "@/lib/utils"
import type { LookupKey } from "@/services/api/lookups"

/**
 * The record field vocabulary.
 *
 * These are *called*, not dispatched to via a type tag. There is no FieldType
 * union and no switch, so there is no second interpreter to keep in sync and no
 * exhaustiveness obligation — the reason a `multiselect` could render as a text
 * box in one surface and a real control in another.
 *
 * Use `recordFields<T>()` at module scope to get a set whose `field` props are
 * checked against `keyof T`.
 */

const GHOST =
  "w-full rounded-md border border-transparent bg-transparent px-2 py-1 text-sm text-slate-800 transition placeholder:text-slate-300 hover:border-slate-200 focus:border-indigo-400 focus:bg-surface focus:outline-none focus:ring-2 focus:ring-indigo-100"

function Label({ children }: { children: ReactNode }) {
  return (
    <div className="text-[11px] font-medium uppercase tracking-wide text-slate-400">{children}</div>
  )
}

function Wrap({
  label,
  full,
  children,
}: {
  label?: string
  full?: boolean
  children: ReactNode
}) {
  return (
    <div className={full ? "sm:col-span-2" : undefined}>
      {label && <Label>{label}</Label>}
      <div className={label ? "mt-0.5" : undefined}>{children}</div>
    </div>
  )
}

/** A textarea that grows to fit its content — no inner scrollbar, no fixed height. */
function AutoGrow({
  value,
  onChange,
  onBlur,
  onFocus,
  onKeyDown,
  placeholder,
  className,
  minRows = 3,
}: {
  value: string
  onChange: (v: string) => void
  onBlur: () => void
  onFocus: () => void
  onKeyDown?: (e: React.KeyboardEvent<HTMLTextAreaElement>) => void
  placeholder?: string
  className?: string
  minRows?: number
}) {
  const ref = useRef<HTMLTextAreaElement>(null)
  useLayoutEffect(() => {
    const el = ref.current
    if (!el) return
    el.style.height = "auto"
    el.style.height = `${el.scrollHeight}px`
  }, [value])
  return (
    <textarea
      ref={ref}
      rows={minRows}
      value={value}
      placeholder={placeholder}
      className={className}
      onFocus={onFocus}
      onChange={(e) => onChange(e.target.value)}
      onBlur={onBlur}
      onKeyDown={onKeyDown}
    />
  )
}

/** Local draft that re-syncs from the server value whenever it isn't focused. */
function useDraft(value: unknown, toText: (v: unknown) => string) {
  const [draft, setDraft] = useState(() => toText(value))
  const [focused, setFocused] = useState(false)
  const [syncedFrom, setSyncedFrom] = useState(value)
  if (!focused && value !== syncedFrom) {
    setSyncedFrom(value)
    setDraft(toText(value))
  }
  return { draft, setDraft, focused, setFocused }
}

const asText = (v: unknown) => (v == null ? "" : String(v))
const orNull = (s: string) => (s.trim() === "" ? null : s)

// --- primitives -------------------------------------------------------------

export function RecordTitle({ field, placeholder }: { field: string; placeholder?: string }) {
  const { value, save } = useField(field)
  const { draft, setDraft, setFocused } = useDraft(value, asText)
  return (
    <div className="sm:col-span-2">
      <AutoGrow
        value={draft}
        minRows={1}
        placeholder={placeholder ?? "Untitled"}
        className={cn(
          GHOST,
          "resize-none overflow-hidden text-xl font-semibold leading-snug text-slate-900",
        )}
        onFocus={() => setFocused(true)}
        onChange={setDraft}
        onKeyDown={(e) => {
          // A title is one line — Enter commits (blur → save) instead of a newline.
          if (e.key === "Enter") {
            e.preventDefault()
            e.currentTarget.blur()
          }
        }}
        onBlur={() => {
          setFocused(false)
          save(orNull(draft))
        }}
      />
    </div>
  )
}

export function RecordText({
  field,
  label,
  placeholder,
  full,
}: {
  field: string
  label?: string
  placeholder?: string
  full?: boolean
}) {
  const { value, save } = useField(field)
  const { draft, setDraft, setFocused } = useDraft(value, asText)
  return (
    <Wrap label={label} full={full}>
      <input
        type="text"
        value={draft}
        placeholder={placeholder ?? "—"}
        className={GHOST}
        onFocus={() => setFocused(true)}
        onChange={(e) => setDraft(e.target.value)}
        onBlur={() => {
          setFocused(false)
          save(orNull(draft))
        }}
      />
    </Wrap>
  )
}

export function RecordTextarea({
  field,
  label,
  placeholder,
  minRows = 4,
}: {
  field: string
  label?: string
  placeholder?: string
  minRows?: number
}) {
  const { value, save } = useField(field)
  const { draft, setDraft, setFocused } = useDraft(value, asText)
  return (
    <Wrap label={label} full>
      <AutoGrow
        value={draft}
        minRows={minRows}
        placeholder={placeholder ?? "—"}
        className={cn(GHOST, "resize-none overflow-hidden leading-relaxed")}
        onFocus={() => setFocused(true)}
        onChange={setDraft}
        onBlur={() => {
          setFocused(false)
          save(orNull(draft))
        }}
      />
    </Wrap>
  )
}

export function RecordNumber({
  field,
  label,
  placeholder,
}: {
  field: string
  label?: string
  placeholder?: string
}) {
  const { value, save } = useField(field)
  const { draft, setDraft, setFocused } = useDraft(value, asText)
  return (
    <Wrap label={label}>
      <input
        type="number"
        value={draft}
        placeholder={placeholder ?? "—"}
        className={GHOST}
        onFocus={() => setFocused(true)}
        onChange={(e) => setDraft(e.target.value)}
        onBlur={() => {
          setFocused(false)
          save(draft.trim() === "" ? null : Number(draft))
        }}
      />
    </Wrap>
  )
}

export function RecordSelect({
  field,
  label,
  options,
  optionLabel,
}: {
  field: string
  label?: string
  options: readonly string[]
  optionLabel?: (o: string) => string
}) {
  const { value, save } = useField(field)
  return (
    <Wrap label={label}>
      <select
        value={(value as string) ?? ""}
        className={cn(GHOST, "cursor-pointer")}
        onChange={(e) => save(e.target.value || null)}
      >
        <option value="">—</option>
        {options.map((o) => (
          <option key={o} value={o}>
            {optionLabel?.(o) ?? o.replace(/_/g, " ")}
          </option>
        ))}
      </select>
    </Wrap>
  )
}

export function RecordDate({ field, label }: { field: string; label?: string }) {
  const { value, save } = useField(field)
  return (
    <Wrap label={label}>
      <input
        type="date"
        value={(value as string) ?? ""}
        className={cn(GHOST, "cursor-text")}
        onChange={(e) => save(e.target.value || null)}
      />
    </Wrap>
  )
}

export function RecordTime({ field, label }: { field: string; label?: string }) {
  const { value, save } = useField(field)
  return (
    <Wrap label={label}>
      <input
        type="time"
        value={String(value ?? "").slice(0, 5)}
        className={cn(GHOST, "cursor-text")}
        onChange={(e) => save(e.target.value || null)}
      />
    </Wrap>
  )
}

export function RecordDateTime({ field, label }: { field: string; label?: string }) {
  const { value, save } = useField(field)
  const { draft, setDraft, setFocused } = useDraft(value, (v) =>
    instantToLocalInput(v as never),
  )
  return (
    <Wrap label={label}>
      <input
        type="datetime-local"
        value={draft}
        className={cn(GHOST, "cursor-text")}
        onFocus={() => setFocused(true)}
        onChange={(e) => setDraft(e.target.value)}
        onBlur={() => {
          setFocused(false)
          save(localInputToInstant(draft))
        }}
      />
    </Wrap>
  )
}

export function RecordCheckbox({ field, label }: { field: string; label: string }) {
  const { value, save } = useField(field)
  return (
    <label className="flex items-center gap-2 py-1 text-sm text-slate-600 sm:col-span-2">
      <input
        type="checkbox"
        className="h-4 w-4"
        checked={!!value}
        onChange={(e) => save(e.target.checked)}
      />
      <span className="font-medium">{label}</span>
    </label>
  )
}

export function RecordRef({
  field,
  label,
  lookup,
}: {
  field: string
  label?: string
  lookup: LookupKey
}) {
  const { value, save } = useField(field)
  return (
    <Wrap label={label}>
      <EntityRefField
        lookup={lookup}
        value={value ? String(value) : null}
        onChange={(id) => save(id ?? null)}
      />
    </Wrap>
  )
}

export function RecordRecurrence({ field, label }: { field: string; label?: string }) {
  const { value, save } = useField(field)
  return (
    <Wrap label={label} full>
      <RecurrenceEditor value={value ? String(value) : ""} onChange={(v) => save(v || null)} />
    </Wrap>
  )
}

/**
 * The soft-poly "filed in" link — one control owning the `entity_type` /
 * `entity_id` pair, written in a single PATCH so the two can't land apart.
 */
export function RecordRoot({ label = "Filed in" }: { label?: string }) {
  const { row, save } = useFields(["entity_type", "entity_id"])
  return (
    <Wrap label={label} full>
      <NoteRootField
        entityType={(row.entity_type as string | null) ?? null}
        entityId={(row.entity_id as string | null) ?? null}
        onSave={(body) => save(body as Record<string, unknown>)}
      />
    </Wrap>
  )
}

/** A comma-separated tag list over a string[] column. */
export function RecordTags({ field, label }: { field: string; label?: string }) {
  const { value, save } = useField(field)
  const { draft, setDraft, setFocused } = useDraft(value, (v) =>
    Array.isArray(v) ? (v as string[]).join(", ") : "",
  )
  return (
    <Wrap label={label} full>
      <input
        type="text"
        value={draft}
        placeholder="comma, separated"
        className={GHOST}
        onFocus={() => setFocused(true)}
        onChange={(e) => setDraft(e.target.value)}
        onBlur={() => {
          setFocused(false)
          save(
            draft
              .split(",")
              .map((s) => s.trim())
              .filter(Boolean),
          )
        }}
      />
    </Wrap>
  )
}

/**
 * A chip-toggle set over a string[] column.
 *
 * The generic editor had no `multiselect` case at all, so `timing` and
 * `days_of_week` fell through to a text input and round-tripped an array as the
 * string "morning,evening". Options outside the fixed list are still shown, so
 * editing never silently drops a legacy value.
 */
export function RecordMultiSelect({
  field,
  label,
  options,
}: {
  field: string
  label?: string
  options: readonly string[]
}) {
  const { value, save } = useField(field)
  const selected = Array.isArray(value) ? (value as string[]) : []
  const opts = [...options, ...selected.filter((s) => !options.includes(s))]
  return (
    <Wrap label={label} full>
      <div className="flex flex-wrap gap-1.5">
        {opts.map((o) => {
          const on = selected.includes(o)
          return (
            <button
              key={o}
              type="button"
              onClick={() =>
                save(on ? selected.filter((x) => x !== o) : [...selected, o])
              }
              className={cn(
                "rounded-full px-2.5 py-1 text-xs font-medium transition",
                on
                  ? "bg-indigo-600 text-on-accent"
                  : "bg-slate-100 text-slate-600 hover:bg-slate-200",
              )}
            >
              {o}
            </button>
          )
        })}
      </div>
    </Wrap>
  )
}

/** Invite list — a chip editor over the raw attendee emails. */
export function RecordAttendees({ field, label }: { field: string; label?: string }) {
  const { value, save } = useField(field)
  return (
    <Wrap label={label} full>
      <AttendeeEditor
        value={Array.isArray(value) ? (value as string[]) : []}
        onChange={(next) => save(next)}
      />
    </Wrap>
  )
}
