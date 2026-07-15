import { useState, type ReactNode } from "react"
import { Outlet, useNavigate } from "react-router-dom"
import { Plus } from "lucide-react"
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

function cellValue<T>(c: Column<T>, row: T): ReactNode {
  return c.render ? c.render(row) : String((row as Record<string, unknown>)[c.key] ?? "—")
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
  const navigate = useNavigate()
  const { data, isLoading } = crud.useList(listParams)
  const create = crud.useCreate()
  const [creating, setCreating] = useState(false)
  const rows = data ?? []

  function open(id: string) {
    navigate(id)
  }

  return (
    <div className="space-y-4">
      <div className="flex items-end justify-between gap-3">
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
        <>
          {/* Table on ≥md */}
          <Card className="hidden overflow-hidden md:block">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-slate-100 text-left text-xs uppercase tracking-wide text-slate-400">
                  {columns.map((c) => (
                    <th key={c.key} className="px-4 py-2 font-medium">
                      {c.label}
                    </th>
                  ))}
                  {rowActions && <th className="px-4 py-2" />}
                </tr>
              </thead>
              <tbody>
                {rows.map((row) => (
                  <tr
                    key={row.id}
                    onClick={() => open(row.id)}
                    className="cursor-pointer border-b border-slate-50 last:border-0 hover:bg-slate-50/60"
                  >
                    {columns.map((c) => (
                      <td key={c.key} className={`px-4 py-2 align-top ${c.className ?? ""}`}>
                        {cellValue(c, row)}
                      </td>
                    ))}
                    {rowActions && (
                      <td
                        className="px-4 py-2 text-right whitespace-nowrap"
                        onClick={(e) => e.stopPropagation()}
                      >
                        {rowActions(row)}
                      </td>
                    )}
                  </tr>
                ))}
              </tbody>
            </table>
          </Card>

          {/* Cards on mobile */}
          <div className="space-y-2 md:hidden">
            {rows.map((row) => (
              <Card
                key={row.id}
                className="cursor-pointer p-3 active:bg-slate-50"
              >
                <div onClick={() => open(row.id)} className="space-y-1">
                  {columns.map((c, i) => (
                    <div key={c.key} className={i === 0 ? "" : "flex justify-between gap-2 text-xs"}>
                      {i === 0 ? (
                        <div className="text-sm font-medium text-slate-800">{cellValue(c, row)}</div>
                      ) : (
                        <>
                          <span className="text-slate-400">{c.label}</span>
                          <span className="text-right text-slate-600">{cellValue(c, row)}</span>
                        </>
                      )}
                    </div>
                  ))}
                </div>
                {rowActions && (
                  <div className="mt-2 flex justify-end" onClick={(e) => e.stopPropagation()}>
                    {rowActions(row)}
                  </div>
                )}
              </Card>
            ))}
          </div>
        </>
      )}

      {creating && (
        <Modal title={`New ${title}`} onClose={() => setCreating(false)}>
          <div className="max-h-[70vh] overflow-y-auto pr-1">
            <EntityForm
              fields={fields}
              onSubmit={(body: Body) => {
                create.mutate(body)
                setCreating(false)
              }}
              onCancel={() => setCreating(false)}
            />
          </div>
        </Modal>
      )}

      {/* Deep-linked detail drawer renders here */}
      <Outlet />
    </div>
  )
}
