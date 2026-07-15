import { useState, type ReactNode } from "react"
import { GitMerge, Pencil, Trash2 } from "lucide-react"
import { MergeDialog } from "@/components/MergeDialog"
import { Backlinks } from "@/components/Backlinks"
import { DateText, PriorityBadge, RefName, StatusBadge } from "@/components/cells"
import { EntityForm, type FieldSpec } from "@/components/EntityForm"
import { Badge, Button, Modal } from "@/components/ui/primitives"
import { humanize } from "@/lib/format"
import { formatDateTime } from "@/lib/utils"
import type { Body } from "@/services/api/crud"
import type { EntityDef } from "@/services/api/registry"
import type { Entity, Priority } from "@/services/api/types"

function isUrl(v: string): boolean {
  return /^https?:\/\//i.test(v)
}

/** Render one field's value read-only, based on its edit FieldSpec. */
function fieldValue(f: FieldSpec, raw: unknown): ReactNode {
  if (raw == null || raw === "" || (Array.isArray(raw) && raw.length === 0)) {
    return <span className="text-slate-300">—</span>
  }
  switch (f.type) {
    case "entity":
      return f.lookup ? <RefName kind={f.lookup} id={String(raw)} /> : String(raw)
    case "date":
      return <DateText value={String(raw)} />
    case "datetime":
      return <span className="text-slate-600">{formatDateTime(String(raw))}</span>
    case "checkbox":
      return <span>{raw ? "Yes" : "No"}</span>
    case "select":
      if (f.name === "priority") return <PriorityBadge priority={raw as Priority} />
      if (f.name === "status" || f.name.endsWith("_status"))
        return <StatusBadge status={String(raw)} />
      return <Badge>{humanize(String(raw))}</Badge>
    case "tags": {
      const arr = Array.isArray(raw) ? (raw as string[]) : []
      return (
        <div className="flex flex-wrap gap-1">
          {arr.map((t) => (
            <Badge key={t}>{t}</Badge>
          ))}
        </div>
      )
    }
    case "number":
      return <span>{String(raw)}</span>
    default: {
      const s = String(raw)
      if (isUrl(s))
        return (
          <a className="break-all text-indigo-600 hover:underline" href={s} target="_blank" rel="noreferrer">
            {s}
          </a>
        )
      return <span className="whitespace-pre-wrap text-slate-700">{s}</span>
    }
  }
}

/** Generic read view for any registered entity: definition list + edit/delete. */
export function DetailView({
  def,
  entity,
  onClose,
  extra,
}: {
  def: EntityDef
  entity: Entity
  onClose: () => void
  extra?: ReactNode
}) {
  const update = def.crud.useUpdate()
  const remove = def.crud.useRemove()
  const [editing, setEditing] = useState(false)
  const [merging, setMerging] = useState(false)
  const row = entity as unknown as Record<string, unknown>

  function submit(body: Body) {
    update.mutate({ id: entity.id, body })
    setEditing(false)
  }

  return (
    <div className="space-y-5">
      <div className="flex items-center gap-2">
        <Button variant="secondary" onClick={() => setEditing(true)}>
          <Pencil size={15} /> Edit
        </Button>
        <Button
          variant="danger"
          onClick={() => {
            if (confirm("Delete this item?")) {
              remove.mutate(entity.id)
              onClose()
            }
          }}
        >
          <Trash2 size={15} /> Delete
        </Button>
        {def.entityType && (
          <Button variant="ghost" onClick={() => setMerging(true)}>
            <GitMerge size={15} /> Merge…
          </Button>
        )}
      </div>

      {merging && def.entityType && (
        <MergeDialog
          type={def.entityType}
          survivor={{ id: entity.id, label: def.title(entity) }}
          onClose={() => setMerging(false)}
        />
      )}

      <dl className="grid grid-cols-1 gap-x-6 gap-y-3 sm:grid-cols-2">
        {def.fields.map((f) => (
          <div key={f.name} className={f.full || f.type === "textarea" ? "sm:col-span-2" : ""}>
            <dt className="text-xs font-medium uppercase tracking-wide text-slate-400">
              {f.label}
            </dt>
            <dd className="mt-0.5 text-sm">{fieldValue(f, row[f.name])}</dd>
          </div>
        ))}
      </dl>

      {extra}

      {def.entityType && <Backlinks type={def.entityType} id={entity.id} />}

      <div className="border-t border-slate-100 pt-3 text-xs text-slate-400">
        Created {formatDateTime(entity.created_at)} · Updated {formatDateTime(entity.updated_at)}
      </div>

      {editing && (
        <Modal title={`Edit ${def.label}`} onClose={() => setEditing(false)}>
          <div className="max-h-[70vh] overflow-y-auto pr-1">
            <EntityForm
              fields={def.fields}
              initial={entity}
              onSubmit={submit}
              onCancel={() => setEditing(false)}
            />
          </div>
        </Modal>
      )}
    </div>
  )
}
