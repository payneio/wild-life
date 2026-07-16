import { useState, type ReactNode } from "react"
import { Check, GitMerge, Pencil, RotateCcw, Trash2 } from "lucide-react"
import { MergeDialog } from "@/components/MergeDialog"
import { Backlinks } from "@/components/Backlinks"
import { PriorityBadge, RefName, StatusBadge } from "@/components/cells"
import { EntityForm, type FieldSpec } from "@/components/EntityForm"
import { Badge, Button, Modal } from "@/components/ui/primitives"
import { humanize, isOverdue } from "@/lib/format"
import { formatDate, formatDateTime } from "@/lib/utils"
import type { Body } from "@/services/api/crud"
import type { EntityDef } from "@/services/api/registry"
import type { Entity, Priority } from "@/services/api/types"

function isUrl(v: string): boolean {
  return /^https?:\/\//i.test(v)
}

function has(v: unknown): boolean {
  return !(v == null || v === "" || (Array.isArray(v) && v.length === 0))
}

/** Turn bare URLs inside free text into links, leave the rest as prose. */
function linkify(text: string): ReactNode {
  const parts = text.split(/(https?:\/\/[^\s]+)/g)
  return parts.map((p, i) =>
    isUrl(p) ? (
      <a
        key={i}
        href={p}
        target="_blank"
        rel="noreferrer"
        className="break-all text-indigo-600 hover:underline"
      >
        {p}
      </a>
    ) : (
      <span key={i}>{p}</span>
    ),
  )
}

/** A compact "Label value" pill used in the at-a-glance header strip. */
function MetaChip({
  label,
  children,
  tone = "default",
}: {
  label: string
  children: ReactNode
  tone?: "default" | "danger"
}) {
  return (
    <span className="inline-flex items-center gap-1.5 rounded-full bg-slate-100 px-2.5 py-1 text-xs">
      <span className="text-slate-400">{label}</span>
      <span
        className={
          tone === "danger" ? "font-medium text-red-600" : "font-medium text-slate-700"
        }
      >
        {children}
      </span>
    </span>
  )
}

/** Render one non-prose scalar field's value (facts grid). */
function factValue(f: FieldSpec, raw: unknown): ReactNode {
  switch (f.type) {
    case "checkbox":
      return raw ? "Yes" : "No"
    case "number":
      return String(raw)
    case "select":
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
    default: {
      const s = String(raw)
      return isUrl(s) ? (
        <a
          className="break-all text-indigo-600 hover:underline"
          href={s}
          target="_blank"
          rel="noreferrer"
        >
          {s}
        </a>
      ) : (
        s
      )
    }
  }
}

/**
 * Purpose-driven read view. Instead of dumping every field, it derives an
 * intentional layout from each entity's field semantics:
 *  - status / priority / key dates / linked context → an at-a-glance header
 *  - the entity's own rich section (`def.extra`) → the primary content
 *  - prose fields (descriptions, outcomes, rationale…) → readable blocks
 *  - remaining non-empty scalars → a tidy secondary facts grid
 * Empty fields are never shown.
 */
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
  const titleStr = String(def.title(entity))

  function submit(body: Body) {
    update.mutate({ id: entity.id, body })
    setEditing(false)
  }

  // --- classify the field list into presentation roles ---------------------
  const hide = new Set(def.detailHide ?? [])
  const fields = def.fields.filter((f) => !hide.has(f.name))
  const statusF = fields.find((f) => f.name === "status" || f.name.endsWith("_status"))
  const priorityF = fields.find((f) => f.name === "priority")
  const dateFs = fields.filter(
    (f) => (f.type === "date" || f.type === "datetime") && has(row[f.name]),
  )
  const refFs = fields.filter((f) => f.type === "entity" && has(row[f.name]))
  const proseFs = fields.filter(
    (f) => f.type === "textarea" && has(row[f.name]) && String(row[f.name]) !== titleStr,
  )
  const handled = new Set(
    [
      statusF?.name,
      priorityF?.name,
      ...dateFs.map((f) => f.name),
      ...refFs.map((f) => f.name),
      ...proseFs.map((f) => f.name),
    ].filter(Boolean) as string[],
  )
  const factFs = fields.filter(
    (f) =>
      !handled.has(f.name) &&
      f.type !== "textarea" &&
      has(row[f.name]) &&
      // a `false` checkbox carries no signal — only surface it when true
      !(f.type === "checkbox" && !row[f.name]) &&
      String(row[f.name]) !== titleStr,
  )

  const isTask = def.entityType === "task"
  const taskDone = isTask && row.status === "completed"

  const hasMeta =
    (statusF && has(row[statusF.name])) ||
    (priorityF && has(row[priorityF.name])) ||
    refFs.length > 0 ||
    dateFs.length > 0
  const hasDetails = proseFs.length > 0 || factFs.length > 0

  return (
    <div className="space-y-5">
      {/* Action bar */}
      <div className="flex items-center gap-1">
        {isTask && (
          <Button
            variant={taskDone ? "secondary" : "primary"}
            size="sm"
            className="mr-1"
            onClick={() =>
              update.mutate({
                id: entity.id,
                body: { status: taskDone ? "planned" : "completed" },
              })
            }
          >
            {taskDone ? <RotateCcw size={14} /> : <Check size={14} />}
            {taskDone ? "Reopen" : "Complete"}
          </Button>
        )}
        <Button variant="ghost" size="sm" onClick={() => setEditing(true)}>
          <Pencil size={14} /> Edit
        </Button>
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
            if (confirm("Delete this item?")) {
              remove.mutate(entity.id)
              onClose()
            }
          }}
        >
          <Trash2 size={14} /> Delete
        </Button>
      </div>

      {/* At-a-glance header strip */}
      {hasMeta && (
        <div className="flex flex-wrap items-center gap-2">
          {statusF && has(row[statusF.name]) && (
            <StatusBadge status={String(row[statusF.name])} />
          )}
          {priorityF && has(row[priorityF.name]) && (
            <PriorityBadge priority={row[priorityF.name] as Priority} />
          )}
          {refFs.map((f) => (
            <MetaChip key={f.name} label={f.label}>
              <RefName kind={f.lookup!} id={String(row[f.name])} />
            </MetaChip>
          ))}
          {dateFs.map((f) => {
            const late = f.name === "due_date" && isOverdue(String(row[f.name]))
            const fmt = f.type === "datetime" ? formatDateTime : formatDate
            return (
              <MetaChip key={f.name} label={f.label} tone={late ? "danger" : "default"}>
                {fmt(String(row[f.name]))}
              </MetaChip>
            )
          })}
        </div>
      )}

      {/* Primary: the entity's own tailored section */}
      {extra}

      {/* Prose blocks */}
      {proseFs.length > 0 && (
        <div className="space-y-4">
          {proseFs.map((f) => (
            <div key={f.name}>
              <h3 className="mb-1 text-[11px] font-semibold uppercase tracking-wide text-slate-400">
                {f.label}
              </h3>
              <p className="whitespace-pre-wrap text-sm leading-relaxed text-slate-700">
                {linkify(String(row[f.name]))}
              </p>
            </div>
          ))}
        </div>
      )}

      {/* Secondary facts */}
      {factFs.length > 0 && (
        <div>
          {(extra || proseFs.length > 0) && (
            <h3 className="mb-2 text-[11px] font-semibold uppercase tracking-wide text-slate-400">
              Details
            </h3>
          )}
          <dl className="grid grid-cols-2 gap-x-6 gap-y-3">
            {factFs.map((f) => (
              <div key={f.name} className={f.full ? "col-span-2" : ""}>
                <dt className="text-[11px] font-medium uppercase tracking-wide text-slate-400">
                  {f.label}
                </dt>
                <dd className="mt-0.5 text-sm text-slate-700">
                  {factValue(f, row[f.name])}
                </dd>
              </div>
            ))}
          </dl>
        </div>
      )}

      {!hasMeta && !hasDetails && !extra && (
        <p className="text-sm text-slate-400">No details yet — use Edit to fill this in.</p>
      )}

      {def.entityType && <Backlinks type={def.entityType} id={entity.id} />}

      <div className="border-t border-slate-100 pt-3 text-xs text-slate-400">
        Created {formatDateTime(entity.created_at)} · Updated{" "}
        {formatDateTime(entity.updated_at)}
      </div>

      {merging && def.entityType && (
        <MergeDialog
          type={def.entityType}
          survivor={{ id: entity.id, label: def.title(entity) }}
          onClose={() => setMerging(false)}
        />
      )}

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
