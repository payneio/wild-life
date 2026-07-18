import { useLayoutEffect, useRef, useState, type ReactNode } from "react"
import { Check, GitMerge, RotateCcw, Trash2 } from "lucide-react"
import { MergeDialog } from "@/components/MergeDialog"
import { Backlinks } from "@/components/Backlinks"
import { RecurrenceEditor } from "@/components/RecurrenceEditor"
import { EntityRefField } from "@/components/graph/EntityRefField"
import { RelatedPanel } from "@/components/graph/RelatedPanel"
import { Button } from "@/components/ui/primitives"
import type { FieldSpec } from "@/components/EntityForm"
import { formatInstant, instantToLocalInput, localInputToInstant } from "@/lib/date"
import { cn } from "@/lib/utils"
import type { Body } from "@/services/api/crud"
import { REGISTRY_BY_TYPE, type EntityDef } from "@/services/api/registry"
import type { Entity } from "@/services/api/types"

/**
 * The one editable record surface. Modeless (no read/edit toggle): every field is
 * shown as content that's editable in place and autosaves on change/blur. It's
 * space-adaptive — the same component renders in a pane, a full page, or a modal;
 * only `variant` tunes the column density. This is the successor to DetailView:
 * same rich sections (the entity's `extra`, related collections, backlinks, merge
 * + delete), but you work in it directly instead of opening an edit form.
 */

const GHOST =
  "w-full rounded-md border border-transparent bg-transparent px-2 py-1 text-sm text-slate-800 transition placeholder:text-slate-300 hover:border-slate-200 focus:border-indigo-400 focus:bg-surface focus:outline-none focus:ring-2 focus:ring-indigo-100"

function toDraft(f: FieldSpec, value: unknown): string {
  if (f.type === "tags") return Array.isArray(value) ? (value as string[]).join(", ") : ""
  if (f.type === "datetime") return instantToLocalInput(value as never)
  return value == null ? "" : String(value)
}

function fromDraft(f: FieldSpec, draft: string): unknown {
  const s = draft.trim()
  if (f.type === "number") return s === "" ? null : Number(s)
  if (f.type === "tags") return s.split(",").map((t) => t.trim()).filter(Boolean)
  return s === "" ? null : draft
}

/** A textarea that grows to fit its content — no inner scrollbar, no fixed height. */
function AutoGrowTextarea({
  value,
  placeholder,
  className,
  minRows = 3,
  onChange,
  onFocus,
  onBlur,
}: {
  value: string
  placeholder?: string
  className?: string
  minRows?: number
  onChange: (v: string) => void
  onFocus: () => void
  onBlur: () => void
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
    />
  )
}

/** One field, shown as content and editable in place; autosaves via `onSave`. */
function InlineField({
  field,
  value,
  onSave,
  variant,
  isTitle = false,
}: {
  field: FieldSpec
  value: unknown
  onSave: (v: unknown) => void
  variant: "page" | "pane"
  isTitle?: boolean
}) {
  const [draft, setDraft] = useState(() => toDraft(field, value))
  const [focused, setFocused] = useState(false)
  const [syncedFrom, setSyncedFrom] = useState(value)

  // Re-sync from the server value when we're not actively editing (record swapped,
  // or an autosave refetch landed) so the field never shows stale text. Done during
  // render (not an effect) per React's "adjust state on prop change" guidance.
  if (!focused && value !== syncedFrom) {
    setSyncedFrom(value)
    setDraft(toDraft(field, value))
  }

  const label = (
    <div className="text-[11px] font-medium uppercase tracking-wide text-slate-400">{field.label}</div>
  )

  // --- checkbox: a single inline row -----------------------------------------
  if (field.type === "checkbox") {
    return (
      <label className="flex items-center gap-2 py-1 text-sm text-slate-600 sm:col-span-2">
        <input type="checkbox" className="h-4 w-4" checked={!!value} onChange={(e) => onSave(e.target.checked)} />
        <span className="font-medium">{field.label}</span>
      </label>
    )
  }

  let control: ReactNode
  switch (field.type) {
    case "textarea":
      control = (
        <AutoGrowTextarea
          value={draft}
          placeholder={field.placeholder ?? "—"}
          minRows={variant === "page" ? 4 : 3}
          className={cn(GHOST, "resize-none overflow-hidden leading-relaxed")}
          onFocus={() => setFocused(true)}
          onChange={setDraft}
          onBlur={() => {
            setFocused(false)
            onSave(fromDraft(field, draft))
          }}
        />
      )
      break
    case "select":
      control = (
        <select
          value={(value as string) ?? ""}
          className={cn(GHOST, "cursor-pointer")}
          onChange={(e) => onSave(e.target.value || null)}
        >
          <option value="">—</option>
          {(field.options ?? []).map((o) => (
            <option key={o} value={o}>
              {o.replace(/_/g, " ")}
            </option>
          ))}
        </select>
      )
      break
    case "entity":
      control = field.lookup ? (
        <EntityRefField
          lookup={field.lookup}
          value={value ? String(value) : null}
          onChange={(id) => onSave(id ?? null)}
        />
      ) : null
      break
    case "recurrence":
      control = <RecurrenceEditor value={value ? String(value) : ""} onChange={(v) => onSave(v || null)} />
      break
    case "date":
      control = (
        <input
          type="date"
          value={(value as string) ?? ""}
          className={cn(GHOST, "cursor-text")}
          onChange={(e) => onSave(e.target.value || null)}
        />
      )
      break
    case "time":
      control = (
        <input
          type="time"
          value={String(value ?? "").slice(0, 5)}
          className={cn(GHOST, "cursor-text")}
          onChange={(e) => onSave(e.target.value || null)}
        />
      )
      break
    case "datetime":
      control = (
        <input
          type="datetime-local"
          value={draft}
          className={cn(GHOST, "cursor-text")}
          onFocus={() => setFocused(true)}
          onChange={(e) => setDraft(e.target.value)}
          onBlur={() => {
            setFocused(false)
            onSave(localInputToInstant(draft))
          }}
        />
      )
      break
    default:
      control = (
        <input
          type={field.type === "number" ? "number" : "text"}
          value={draft}
          placeholder={field.placeholder ?? (isTitle ? field.label : "—")}
          className={cn(
            GHOST,
            isTitle && "font-semibold text-slate-900",
            isTitle && (variant === "page" ? "text-xl" : "text-lg"),
          )}
          onFocus={() => setFocused(true)}
          onChange={(e) => setDraft(e.target.value)}
          onBlur={() => {
            setFocused(false)
            onSave(fromDraft(field, draft))
          }}
        />
      )
  }

  // The title carries its own weight — no label chrome above it.
  if (isTitle) return <div className="sm:col-span-2">{control}</div>
  return (
    <div className={field.full || field.type === "textarea" || field.type === "recurrence" ? "sm:col-span-2" : ""}>
      {label}
      <div className="mt-0.5">{control}</div>
    </div>
  )
}

export function EditableRecord({
  def,
  entity,
  onClose,
  onDelete,
  variant = "page",
}: {
  def: EntityDef
  entity: Entity
  onClose: () => void
  /** Override the built-in whole-row delete (e.g. recurrence-scoped on the calendar). */
  onDelete?: () => void
  variant?: "page" | "pane"
}) {
  const update = def.crud.useUpdate()
  const remove = def.crud.useRemove()
  const [merging, setMerging] = useState(false)
  const row = entity as unknown as Record<string, unknown>

  const save = (name: string, value: unknown) =>
    update.mutate({ id: entity.id, body: { [name]: value } as Body })

  const isTask = def.entityType === "task"
  const taskDone = isTask && row.status === "completed"

  // Notes is the trailing free-form scratchpad — pull it out of the grid so it
  // always sits at the very bottom, full-width, and grows with what you write.
  const notesField = def.fields.find((f) => f.name === "notes")
  const gridFields = def.fields.filter((f) => f.name !== "notes")

  return (
    <div className="space-y-5">
      {/* Action bar */}
      <div className="flex items-center gap-1">
        {isTask && (
          <Button
            variant={taskDone ? "secondary" : "primary"}
            size="sm"
            className="mr-1"
            onClick={() => save("status", taskDone ? "planned" : "completed")}
          >
            {taskDone ? <RotateCcw size={14} /> : <Check size={14} />}
            {taskDone ? "Reopen" : "Complete"}
          </Button>
        )}
        {def.entityType && (
          <Button variant="ghost" size="sm" onClick={() => setMerging(true)}>
            <GitMerge size={14} /> Merge
          </Button>
        )}
        <Button
          variant="ghost"
          size="sm"
          className="ml-auto text-slate-400 hover:text-red-600"
          onClick={() => {
            if (onDelete) return onDelete()
            if (confirm("Delete this item?")) {
              remove.mutate(entity.id)
              onClose()
            }
          }}
        >
          <Trash2 size={14} /> Delete
        </Button>
      </div>

      {/* Editable fields — content you work in directly */}
      <div className={cn("grid grid-cols-1 gap-x-6 gap-y-3", variant === "page" && "sm:grid-cols-2")}>
        {gridFields.map((f) => (
          <InlineField
            key={f.name}
            field={f}
            value={row[f.name]}
            onSave={(v) => save(f.name, v)}
            variant={variant}
            isTitle={f.name === def.titleField}
          />
        ))}
      </div>

      {/* The entity's own rich section */}
      {def.extra && <def.extra entity={entity} />}

      {/* Generic related collections (navigable + add/create). */}
      {def.entityType &&
        def.relations?.map((spec, i) => {
          const targetDef = REGISTRY_BY_TYPE[spec.type]
          if (!targetDef) return null
          return (
            <RelatedPanel
              key={`${spec.mode}:${spec.label}:${i}`}
              parent={entity}
              parentType={def.entityType!}
              spec={spec}
              targetDef={targetDef}
            />
          )
        })}

      {def.entityType && <Backlinks type={def.entityType} id={entity.id} />}

      {/* Notes — the trailing scratchpad, always at the bottom, auto-growing. */}
      {notesField && (
        <InlineField
          field={notesField}
          value={row.notes}
          onSave={(v) => save("notes", v)}
          variant={variant}
        />
      )}

      <div className="border-t border-slate-100 pt-3 text-xs text-slate-400">
        Created {formatInstant(entity.created_at)} · Updated {formatInstant(entity.updated_at)}
      </div>

      {merging && def.entityType && (
        <MergeDialog
          type={def.entityType}
          survivor={{ id: entity.id, label: def.title(entity) }}
          onClose={() => setMerging(false)}
        />
      )}
    </div>
  )
}
