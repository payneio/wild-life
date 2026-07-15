import { useState, type ReactNode } from "react"
import { Pencil, Plus, Trash2 } from "lucide-react"
import { Button, Card, EmptyState, Modal } from "@/components/ui/primitives"
import { EntityForm, type FieldSpec } from "@/components/EntityForm"
import type { createCrud } from "@/services/api/crud"
import type { Body } from "@/services/api/crud"
import type { Entity } from "@/services/api/types"

type Crud<T extends Entity> = ReturnType<typeof createCrud<T>>

export interface Column<T> {
  key: string
  label: string
  render?: (row: T) => ReactNode
  className?: string
}

export function SimpleEntityPage<T extends Entity>({
  title,
  subtitle,
  crud,
  fields,
  columns,
  newLabel = "New",
  listParams,
  emptyText = "Nothing here yet.",
  rowActions,
}: {
  title: string
  subtitle?: string
  crud: Crud<T>
  fields: FieldSpec[]
  columns: Column<T>[]
  newLabel?: string
  listParams?: Record<string, string | undefined>
  emptyText?: string
  rowActions?: (row: T) => ReactNode
}) {
  const { data, isLoading } = crud.useList(listParams)
  const create = crud.useCreate()
  const update = crud.useUpdate()
  const remove = crud.useRemove()
  const [editing, setEditing] = useState<T | null>(null)
  const [creating, setCreating] = useState(false)

  const rows = data ?? []

  function submit(body: Body) {
    if (editing) update.mutate({ id: editing.id, body })
    else create.mutate(body)
    setEditing(null)
    setCreating(false)
  }

  return (
    <div className="space-y-4">
      <div className="flex items-end justify-between">
        <div>
          <h1 className="text-lg font-semibold text-slate-900">{title}</h1>
          {subtitle && <p className="text-sm text-slate-500">{subtitle}</p>}
        </div>
        <Button onClick={() => setCreating(true)}>
          <Plus size={16} />
          {newLabel}
        </Button>
      </div>

      {isLoading ? (
        <EmptyState>Loading…</EmptyState>
      ) : rows.length === 0 ? (
        <EmptyState>{emptyText}</EmptyState>
      ) : (
        <Card className="overflow-hidden">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-slate-100 text-left text-xs uppercase tracking-wide text-slate-400">
                {columns.map((c) => (
                  <th key={c.key} className="px-4 py-2 font-medium">
                    {c.label}
                  </th>
                ))}
                <th className="px-4 py-2" />
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => (
                <tr
                  key={row.id}
                  className="border-b border-slate-50 last:border-0 hover:bg-slate-50/60"
                >
                  {columns.map((c) => (
                    <td key={c.key} className={`px-4 py-2 align-top ${c.className ?? ""}`}>
                      {c.render
                        ? c.render(row)
                        : String((row as Record<string, unknown>)[c.key] ?? "—")}
                    </td>
                  ))}
                  <td className="px-4 py-2 text-right whitespace-nowrap">
                    {rowActions?.(row)}
                    <button
                      className="ml-1 rounded p-1 text-slate-400 hover:bg-slate-100 hover:text-slate-700"
                      onClick={() => setEditing(row)}
                      title="Edit"
                    >
                      <Pencil size={15} />
                    </button>
                    <button
                      className="ml-1 rounded p-1 text-slate-400 hover:bg-red-50 hover:text-red-600"
                      onClick={() => {
                        if (confirm("Delete this item?")) remove.mutate(row.id)
                      }}
                      title="Delete"
                    >
                      <Trash2 size={15} />
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </Card>
      )}

      {(creating || editing) && (
        <Modal
          title={editing ? `Edit ${title}` : `New ${title}`}
          onClose={() => {
            setEditing(null)
            setCreating(false)
          }}
        >
          <EntityForm
            fields={fields}
            initial={editing ?? undefined}
            onSubmit={submit}
            onCancel={() => {
              setEditing(null)
              setCreating(false)
            }}
          />
        </Modal>
      )}
    </div>
  )
}
