import { useRef, useState } from "react"
import { Plus, X } from "lucide-react"
import { StatusBadge } from "@/components/cells"
import { Section } from "@/components/detail/kit"
import { EntityPicker } from "@/components/graph/EntityPicker"
import { EntityRef } from "@/components/graph/EntityRef"
import type { Body } from "@/services/api/crud"
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
  const items = targetDef.crud.useList(params).data ?? []
  const update = targetDef.crud.useUpdate()
  const [open, setOpen] = useState(false)
  const addRef = useRef<HTMLButtonElement>(null)

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
      : { entity_type: parentType, entity_id: parent.id }

  return (
    <Section
      title={`${spec.label} · ${items.length}`}
      action={
        <button
          ref={addRef}
          type="button"
          onClick={() => setOpen(true)}
          className="inline-flex items-center gap-1 rounded-lg px-2 py-1 text-xs font-medium text-slate-500 transition hover:bg-slate-100 hover:text-slate-800"
        >
          <Plus size={13} /> Add
        </button>
      }
    >
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
                <button
                  type="button"
                  title="Unlink"
                  onClick={() => update.mutate({ id: row.id, body: unlinkBody })}
                  className="shrink-0 rounded p-0.5 text-slate-300 transition hover:text-red-600"
                >
                  <X size={14} />
                </button>
              </li>
            )
          })}
        </ul>
      )}
      {open && (
        <EntityPicker
          getAnchor={() => addRef.current}
          type={spec.type}
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
