import { useRef, useState } from "react"
import { Plus, X } from "lucide-react"
import { StatusBadge } from "@/components/cells"
import { Section } from "@/components/detail/kit"
import { EntityPicker } from "@/components/graph/EntityPicker"
import { EntityRef } from "@/components/graph/EntityRef"
import type { Body } from "@/services/api/crud"
import { byLifecycle } from "@/services/api/lifecycle"
import type { EntityDef, RelationSpec } from "@/services/api/registry"
import type { Entity, EntityType } from "@/services/api/types"

/**
 * Generic related-collection: a navigable list of the target rows plus an "Add"
 * that opens the searchable picker (with inline quick-create). Both link modes
 * are just a `crud.useList(params)` read and a `useUpdate` patch — no bespoke
 * hooks. `targetDef` is resolved and passed by `DetailView` so this component
 * never imports the registry (keeps the module graph acyclic).
 */
export function RelatedPanel({
  parent,
  parentType,
  spec,
  targetDef,
}: {
  parent: Entity
  parentType: EntityType
  spec: RelationSpec
  targetDef: EntityDef
}) {
  const parentRow = parent as unknown as Record<string, unknown>
  const params =
    spec.mode === "fk-children"
      ? { [spec.fkField]: parent.id }
      : { entity_type: parentType, entity_id: parent.id }
  // Live work first, finished last — a panel has no toolbar to sort with, so the
  // one order it shows had better be the one you read in.
  const items = byLifecycle(spec.type, targetDef.crud.useList(params).data ?? [])
  const update = targetDef.crud.useUpdate()
  const [open, setOpen] = useState(false)
  const addRef = useRef<HTMLButtonElement>(null)

  // Whether an *empty* panel is offered at all.
  //
  // Two things can say yes: the panel is always-on for this type, or the parent
  // declares it deals with this kind of thing (`involves`). What can never
  // suppress a panel is having rows — turning Medications off on a program that
  // has medications must not make them invisible, which is the same guarantee
  // `entities/coverage.test.tsx` gives fields.
  const involves = Array.isArray((parent as { involves?: unknown }).involves)
    ? ((parent as unknown as { involves: string[] }).involves ?? [])
    : []
  const offered = !spec.hideWhenEmpty || involves.includes(spec.type)
  if (items.length === 0 && !offered) return null

  // A panel that lists rows it doesn't own the link to shows them and stops —
  // no Add, no unlink. An empty one would be a control with nothing behind it.
  const readOnly = spec.mode === "fk-children" && spec.readOnly === true
  if (readOnly && items.length === 0) return null

  const linkBody: Body =
    spec.mode === "fk-children"
      ? { [spec.fkField]: parent.id }
      : { entity_type: parentType, entity_id: parent.id }
  const unlinkBody: Body =
    spec.mode === "fk-children"
      ? { [spec.fkField]: null }
      : { entity_type: null, entity_id: null }

  // Quick-create inherits the linking field(s) plus any declared context.
  const createDefaults: Body =
    spec.mode === "fk-children"
      ? {
          [spec.fkField]: parent.id,
          ...Object.fromEntries(
            (spec.inherit ?? [])
              .map((f) => [f, parentRow[f]])
              .filter(([, v]) => v != null),
          ),
        }
      : { entity_type: parentType, entity_id: parent.id, ...(spec.defaults ?? {}) }

  return (
    <Section
      title={`${spec.label} · ${items.length}`}
      action={
        !readOnly && (
          <button
            ref={addRef}
            type="button"
            onClick={() => setOpen(true)}
            className="inline-flex items-center gap-1 rounded-lg px-2 py-1 text-xs font-medium text-slate-500 transition hover:bg-slate-100 hover:text-slate-800"
          >
            <Plus size={13} /> Add
          </button>
        )
      }
    >
      {/* Some objects can't be made from a title alone — an event needs a when.
          Those bring their own capture surface; the picker above still links an
          existing one. */}
      {targetDef.capture && spec.mode === "soft-backref" && (
        <targetDef.capture root={{ type: parentType, id: parent.id }} />
      )}

      {items.length === 0 ? (
        <p className="text-sm text-slate-400">None yet.</p>
      ) : (
        <ul className="max-h-80 space-y-1 overflow-y-auto pr-1">
          {items.map((row) => {
            const r = row as unknown as Record<string, unknown>
            const status = typeof r.status === "string" ? r.status : undefined
            return (
              <li
                key={row.id}
                className="flex items-center gap-2 rounded-lg border border-slate-100 bg-surface px-3 py-2"
              >
                <EntityRef
                  type={spec.type}
                  id={row.id}
                  className="min-w-0 flex-1 break-words text-sm text-slate-700"
                >
                  {String(targetDef.title(row))}
                </EntityRef>
                {status && <StatusBadge status={status} />}
                {!readOnly && (
                  <button
                    type="button"
                    title="Unlink"
                    onClick={() => update.mutate({ id: row.id, body: unlinkBody })}
                    className="shrink-0 rounded p-0.5 text-slate-300 transition hover:text-red-600"
                  >
                    <X size={14} />
                  </button>
                )}
              </li>
            )
          })}
        </ul>
      )}
      {open && (
        <EntityPicker
          getAnchor={() => addRef.current}
          type={spec.type}
          intent="assign"
          createDefaults={createDefaults}
          placeholder={`Add ${targetDef.label.toLowerCase()}…`}
          onClose={() => setOpen(false)}
          onSelect={(sel) => {
            // Idempotent for a freshly quick-created row (already linked).
            update.mutate({ id: sel.id, body: linkBody })
            setOpen(false)
          }}
        />
      )}
    </Section>
  )
}
