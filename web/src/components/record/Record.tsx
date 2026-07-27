import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from "react"
import { Check, GitMerge, NotebookPen, RotateCcw, Trash2 } from "lucide-react"
import { Backlinks } from "@/components/Backlinks"
import { MergeDialog } from "@/components/MergeDialog"
import { InvolvesControl } from "@/components/record/InvolvesControl"
import { NoteRootField } from "@/components/graph/NoteRootField"
import { RelatedPanel } from "@/components/graph/RelatedPanel"
import { RecordContext, useCoverage } from "@/components/record/context"
import { Button } from "@/components/ui/primitives"
import { useFloatingNote } from "@/notes/floatingNoteContext"
import { formatInstant } from "@/lib/date"
import type { Body } from "@/services/api/crud"
import { optionalPanels, REGISTRY_BY_TYPE, type EntityDef } from "@/services/api/registry"
import type { Entity } from "@/services/api/types"

/**
 * The record surface: chrome around a layout the entity owns.
 *
 * The split is deliberate. Everything generic — the action bar, the related
 * collections driven by `def.relations`, backlinks, the timestamps — lives here
 * so no entity repeats it. Everything *specific* — which fields, in what order,
 * under which headings, with which bespoke controls — is the `children` the
 * entity writes as plain JSX.
 *
 * This is a **total** override, not a partial one. An entity either composes its
 * own layout here or uses the generic `EditableRecord`; it never inserts a
 * fragment *alongside* a generic renderer. Partial overrides are what forced the
 * old `extra` + `detailHide` pair to coordinate out-of-band about who renders
 * what — a coordination channel that silently went dead. With a total override
 * there is nothing to coordinate: a field renders once because it's written once.
 */
export function Record({
  def,
  entity,
  onClose,
  onDelete,
  omit = [],
  onCoverage,
  children,
}: {
  def: EntityDef
  entity: Entity
  onClose: () => void
  /** Override the built-in whole-row delete (e.g. recurrence-scoped on the calendar). */
  onDelete?: () => void
  /** Keys deliberately not rendered, each for a stated reason. */
  omit?: readonly string[]
  /** Test seam: receives the unrendered, unexcused keys. */
  onCoverage?: (missing: string[]) => void
  children: ReactNode
}) {
  const update = def.crud.useUpdate()
  const remove = def.crud.useRemove()
  const { openNote } = useFloatingNote()
  const [merging, setMerging] = useState(false)
  const registry = useRef<Set<string>>(new Set())
  const row = entity as unknown as Record<string, unknown>

  const save = useCallback(
    (field: string, value: unknown) =>
      update.mutate({ id: entity.id, body: { [field]: value } as Body }),
    // `update` is a fresh object each render; the id is what actually varies.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [entity.id],
  )
  const saveMany = useCallback(
    (body: Record<string, unknown>) => update.mutate({ id: entity.id, body: body as Body }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [entity.id],
  )
  const register = useCallback((field: string) => {
    registry.current.add(field)
  }, [])
  const ctx = useMemo(
    () => ({ row, save, saveMany, register }),
    [row, save, saveMany, register],
  )

  // `involves` is bound by the action-bar control rather than a field primitive,
  // so register it here — it *is* covered, just not by an `<F.…>`. Declared
  // before `useCoverage` so it lands before coverage is compared.
  useEffect(() => {
    if (optionalPanels(def).length > 0) registry.current.add("involves")
  })
  useCoverage(row, registry, omit, def.key, onCoverage)

  const isTask = def.entityType === "task"
  const taskDone = isTask && row.status === "completed"

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
        {def.entityType && def.entityType !== "note" && (
          <Button
            variant="ghost"
            size="sm"
            onClick={() =>
              openNote({
                owner: { type: def.entityType!, id: entity.id },
                noteType: def.entityType === "event" ? "meeting" : undefined,
              })
            }
          >
            <NotebookPen size={14} /> {def.entityType === "event" ? "New meeting note" : "New note"}
          </Button>
        )}
        {def.entityType && (
          <Button variant="ghost" size="sm" onClick={() => setMerging(true)}>
            <GitMerge size={14} /> Merge
          </Button>
        )}
        <InvolvesControl
          def={def}
          entity={entity}
          onSave={(involves) => update.mutate({ id: entity.id, body: { involves } })}
        />
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

      {/* The entity's own layout */}
      <RecordContext.Provider value={ctx}>{children}</RecordContext.Provider>

      {/* Primary context — the single entity this is "about". */}
      {def.contextLabel && (
        <div>
          <div className="text-[11px] font-medium uppercase tracking-wide text-slate-400">
            {def.contextLabel}
          </div>
          <div className="mt-0.5">
            <NoteRootField
              entityType={(row.entity_type as string | null) ?? null}
              entityId={(row.entity_id as string | null) ?? null}
              onSave={(body) => update.mutate({ id: entity.id, body: body as Body })}
            />
          </div>
        </div>
      )}

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

/** A titled group of fields inside a record layout. */
export function RecordSection({
  title,
  action,
  children,
  columns = true,
}: {
  title?: string
  action?: ReactNode
  children: ReactNode
  /** Lay children out in the two-column field grid (the default). */
  columns?: boolean
}) {
  return (
    <section className="space-y-2">
      {(title || action) && (
        <div className="flex items-center justify-between gap-2">
          {title && (
            <h3 className="text-[11px] font-semibold uppercase tracking-wide text-slate-400">
              {title}
            </h3>
          )}
          {action}
        </div>
      )}
      <div className={columns ? "grid grid-cols-1 gap-x-6 gap-y-3 sm:grid-cols-2" : undefined}>
        {children}
      </div>
    </section>
  )
}

/**
 * A chrome-less record surface for rows edited in place *inside* another record
 * — a protocol's steps, say. Same field primitives, same autosave, but no action
 * bar, no relations, and no coverage check: a sub-record edits a deliberate
 * subset of its row, so completeness isn't the contract here.
 */
export function SubRecord({
  crud,
  entity,
  children,
}: {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  crud: { useUpdate: () => { mutate: (v: { id: string; body: any }) => void } }
  entity: Entity
  children: ReactNode
}) {
  const update = crud.useUpdate()
  const registry = useRef<Set<string>>(new Set())
  const row = entity as unknown as Record<string, unknown>

  const save = useCallback(
    (field: string, value: unknown) => update.mutate({ id: entity.id, body: { [field]: value } }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [entity.id],
  )
  const saveMany = useCallback(
    (body: Record<string, unknown>) => update.mutate({ id: entity.id, body }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [entity.id],
  )
  const register = useCallback((field: string) => {
    registry.current.add(field)
  }, [])
  const ctx = useMemo(
    () => ({ row, save, saveMany, register }),
    [row, save, saveMany, register],
  )
  return <RecordContext.Provider value={ctx}>{children}</RecordContext.Provider>
}
