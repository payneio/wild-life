import { useLayoutEffect, useRef, useState, type ReactNode } from "react"
import { EntityRefField } from "@/components/graph/EntityRefField"
import { RecurrenceEditor } from "@/components/RecurrenceEditor"
import { RootField } from "@/components/graph/RootField"
import { AttendeeEditor } from "@/components/calendar/AttendeeEditor"
import { MentionText } from "@/components/MentionText"
import { useField, useFields, useRecordRow } from "@/components/record/context"
import { instantToLocalInput, localInputToInstant } from "@/lib/date"
import { cn } from "@/lib/utils"
import type { Body } from "@/services/api/crud"
import type { LookupKey } from "@/services/api/lookups"
import type { PickerIntent } from "@/services/api/mentions"
import { formatPhone, formatWhileTyping, toE164 } from "@/lib/phone"

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
  autoFocus,
}: {
  value: string
  onChange: (v: string) => void
  onBlur: () => void
  onFocus: () => void
  onKeyDown?: (e: React.KeyboardEvent<HTMLTextAreaElement>) => void
  placeholder?: string
  className?: string
  minRows?: number
  autoFocus?: boolean
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
      autoFocus={autoFocus}
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

/**
 * A phone number. Formats as you type — `2063996403` becomes `(206) 399-6403`
 * under the caret — and commits E.164, matching what the API stores. Unfocused,
 * it renders the stored E.164 back in local form, so old rows and new ones look
 * identical.
 */
export function RecordPhone({
  field,
  label,
  placeholder,
}: {
  field: string
  label?: string
  placeholder?: string
}) {
  const { value, save } = useField(field)
  const { draft, setDraft, setFocused } = useDraft(value, (v) => formatPhone(asText(v)))
  return (
    <Wrap label={label}>
      <input
        type="tel"
        inputMode="tel"
        autoComplete="tel"
        value={draft}
        placeholder={placeholder ?? "—"}
        className={GHOST}
        onFocus={() => setFocused(true)}
        onChange={(e) => setDraft(formatWhileTyping(e.target.value, draft))}
        onBlur={() => {
          setFocused(false)
          save(orNull(toE164(draft)))
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

/**
 * Long-form prose: rendered while at rest, raw source while you're in it.
 *
 * Not the read-mode/edit-mode toggle the architecture rejects — that one is a
 * record-level Edit button gating every field. Here the field is still edited
 * in place and autosaves on blur; clicking the prose puts you straight in the
 * text. The rendered form is simply what the field looks like when it isn't
 * focused, the same trade `NoteComposer` already makes.
 *
 * Worth it only where the text arrives formatted — an invite body, a journal
 * entry. Short scratch fields stay `RecordTextarea`, where swapping elements on
 * focus would be friction for text nobody marks up.
 */
export function RecordMarkdown({
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
  const { draft, setDraft, focused, setFocused } = useDraft(value, asText)
  return (
    <Wrap label={label} full>
      {focused ? (
        <AutoGrow
          value={draft}
          minRows={minRows}
          placeholder={placeholder ?? "—"}
          className={cn(GHOST, "resize-none overflow-hidden leading-relaxed")}
          autoFocus
          onFocus={() => setFocused(true)}
          onChange={setDraft}
          onBlur={() => {
            setFocused(false)
            save(orNull(draft))
          }}
        />
      ) : (
        // Focusable in its own right, so the field is still reachable by keyboard
        // rather than only by pointer.
        <div
          role="textbox"
          tabIndex={0}
          className={cn(GHOST, "cursor-text leading-relaxed")}
          onClick={() => setFocused(true)}
          onFocus={() => setFocused(true)}
        >
          {draft.trim() ? (
            <MentionText>{draft}</MentionText>
          ) : (
            <span className="text-slate-400">{placeholder ?? "—"}</span>
          )}
        </div>
      )}
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

/**
 * The soft-polymorphic root, the one piece of context a record can hand to a
 * row it creates without knowing what either of them is.
 *
 * Only this pair, deliberately: it means the same thing on every record that
 * carries it, so copying it across is always the filing the user meant. Name
 * equality is not meaning equality in general — a moment's `kind` and an
 * outcome's `kind` are different vocabularies — so anything else a type needs
 * has to be passed explicitly.
 */
function rootOf(row: Record<string, unknown>): Body | undefined {
  const { entity_type, entity_id } = row
  return entity_type && entity_id ? { entity_type, entity_id } : undefined
}

export function RecordRef({
  field,
  label,
  lookup,
  required,
  intent,
  createDefaults,
}: {
  field: string
  label?: string
  lookup: LookupKey
  required?: boolean
  intent?: PickerIntent
  /** Overrides the inherited root — for a target that needs something else. */
  createDefaults?: Body
}) {
  const { value, save } = useField(field)
  const row = useRecordRow()
  return (
    <Wrap label={label}>
      <EntityRefField
        lookup={lookup}
        value={value ? String(value) : null}
        onChange={(id) => save(id ?? null)}
        required={required}
        intent={intent}
        createDefaults={createDefaults ?? rootOf(row)}
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
export function RecordRoot({
  label = "Filed in",
  typeField = "entity_type",
  idField = "entity_id",
}: {
  label?: string
  /** The pair this control binds. `tasks` names its scope `scope_type`/
   *  `scope_id`; everything else calls the same shape `entity_type`/`entity_id`,
   *  which is why the column names are a parameter rather than the concept. */
  typeField?: string
  idField?: string
}) {
  const { row, save } = useFields([typeField, idField])
  return (
    <Wrap label={label} full>
      <RootField
        entityType={(row[typeField] as string | null) ?? null}
        entityId={(row[idField] as string | null) ?? null}
        onSave={(body) =>
          save({ [typeField]: body.entity_type, [idField]: body.entity_id })
        }
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
