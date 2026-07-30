import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from "react"
import { Check, GitMerge, NotebookPen, RotateCcw, Trash2 } from "lucide-react"
import { Backlinks } from "@/components/Backlinks"
import { Log } from "@/components/Log"
import { Section } from "@/components/detail/kit"
import { MergeDialog } from "@/components/MergeDialog"
import { Ancestry } from "@/components/record/Ancestry"
import { InvolvesControl } from "@/components/record/InvolvesControl"
import { RelatedPanel } from "@/components/graph/RelatedPanel"
import { RecordContext, useCoverage } from "@/components/record/context"
import { Button } from "@/components/ui/primitives"
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
  const [merging, setMerging] = useState(false)
  const registry = useRef<Set<string>>(new Set())
  const row = entity as unknown as Record<string, unknown>

  // Scroll the Log into view and hand the writer the cursor. Two steps because
  // they are two different things: where the page is, and where you are typing.
  const logRef = useRef<HTMLDivElement>(null)
  const [focusLog, setFocusLog] = useState(0)
  const writeInLog = useCallback(() => {
    logRef.current?.scrollIntoView({ block: "start", behavior: "smooth" })
    setFocusLog((n) => n + 1)
  }, [])

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
      {/* Where this sits, above everything it could act on — and tucked close to
          the action bar, since together they're one band of chrome. */}
      <div className="space-y-1.5">
        <Ancestry type={def.entityType} id={entity.id} />

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
        {/* Not a second composer — the one in the Log band below, brought to
            you. A record that opened a pop-out offered two ways to write the
            same observation about the same thing, one of them a 380px window
            floating over the stream the entry was about to join. On a long
            record (an area with 66 metrics) the band is a long way down, so
            what the button is really for is the distance. */}
        {def.entityType && def.entityType !== "moment" && (
          <Button variant="ghost" size="sm" onClick={writeInLog}>
            <NotebookPen size={14} /> Write
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
      </div>

      {/* The entity's own layout */}
      <RecordContext.Provider value={ctx}>{children}</RecordContext.Provider>


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

      {/* The log is a band, not a relation. Being declarable meant being
          forgettable: nine objects had no Notes panel and grew a `notes` column
          instead, which is how dated events ended up in a field. Every object
          that can be a moment's subject has one, in the same place, always —
          and that now includes `moment`, which is a valid `entity_type`.

          It was excluded on the grounds that a moment about a moment is a
          mention. That is true of a reflection which merely references
          Thursday's meeting, and false of the notes you took *during* it: there
          the meeting is the subject. Which is the distinction `subject` and
          `mention` already draw, for the other twenty-four types, without
          anyone needing a rule about the type on the other end. The exclusion
          answered with a type check a question the roles had already answered.

          Its cost was that an occasion — the thing people most often take notes
          about — was the one object in the system with nowhere to write. The
          notes went to the recurring *rule* instead, because a Routine had a
          band, so every week's notes piled onto one object that could not say
          which occurrence they belonged to.

          It is the object's whole dated history, not just its writing — which
          is what let `ProgramTimeline` go. A program showed events here and the
          Log there with nothing to say which you should add to; that
          unexplainable choice was the modelling defect this inversion fixes,
          surfacing as a UX one. */}
      {def.entityType && (
        <div ref={logRef}>
          <Section title="Log">
            <Log
              subject={{ type: def.entityType, id: entity.id }}
              base="/moments"
              focusSignal={focusLog}
            />
          </Section>
        </div>
      )}

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
