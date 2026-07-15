import { useMemo, useState, type ReactNode } from "react"
import { Outlet, useNavigate, useParams } from "react-router-dom"
import { Plus } from "lucide-react"
import { Button, Card, EmptyState, Modal } from "@/components/ui/primitives"
import { EntityForm, type FieldSpec } from "@/components/EntityForm"
import { ListToolbar } from "@/components/ListToolbar"
import { deriveListConfig, useListFilter } from "@/lib/listFilter"
import { cn } from "@/lib/utils"
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

/**
 * Master/detail list page: a compact list on the left (search/filter toolbar +
 * rows) and a persistent detail pane on the right (desktop) / full-screen overlay
 * (mobile), rendered from the `/:id` child route via <Outlet/>. Clicking a row
 * navigates to its detail without dismissing the list.
 */
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
  const { id: selectedId } = useParams()
  const { data, isLoading } = crud.useList(listParams)
  const create = crud.useCreate()
  const [creating, setCreating] = useState(false)
  const rows = useMemo(() => data ?? [], [data])

  const config = useMemo(
    () => deriveListConfig(fields, columns[0]?.key ?? "name"),
    [fields, columns],
  )
  const { filtered, toolbarProps } = useListFilter(
    rows as unknown as Record<string, unknown>[],
    config,
  )
  const list = filtered as unknown as T[]

  return (
    <div className="flex flex-col gap-4 lg:flex-row">
      {/* LEFT — list column */}
      <div className="space-y-3 lg:w-96 lg:shrink-0">
        <div className="flex items-end justify-between gap-2">
          <div className="min-w-0">
            <h1 className="text-lg font-semibold text-slate-900">{title}</h1>
            {subtitle && <p className="truncate text-sm text-slate-500">{subtitle}</p>}
          </div>
          <Button onClick={() => setCreating(true)}>
            <Plus size={16} />
            {newLabel}
          </Button>
        </div>

        <ListToolbar {...toolbarProps} />

        {isLoading ? (
          <EmptyState>Loading…</EmptyState>
        ) : rows.length === 0 ? (
          <EmptyState>{emptyText}</EmptyState>
        ) : list.length === 0 ? (
          <EmptyState>No matches.</EmptyState>
        ) : (
          <Card className="max-h-[75vh] overflow-y-auto">
            <ul>
              {list.map((row) => (
                <li key={row.id}>
                  <div
                    role="button"
                    tabIndex={0}
                    onClick={() => navigate(row.id)}
                    onKeyDown={(e) => (e.key === "Enter" || e.key === " ") && navigate(row.id)}
                    className={cn(
                      "flex cursor-pointer items-start gap-2 border-b border-slate-50 px-3 py-2 last:border-0 hover:bg-slate-50/70 focus:bg-slate-50 focus:outline-none",
                      row.id === selectedId && "bg-indigo-50 hover:bg-indigo-50",
                    )}
                  >
                    <div className="min-w-0 flex-1">
                      <div className="truncate text-sm font-medium text-slate-800">
                        {cellValue(columns[0], row)}
                      </div>
                      {columns.length > 1 && (
                        <div className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-slate-500">
                          {columns.slice(1).map((c) => (
                            <span key={c.key} className="truncate">
                              {cellValue(c, row)}
                            </span>
                          ))}
                        </div>
                      )}
                    </div>
                    {rowActions && (
                      <div className="shrink-0" onClick={(e) => e.stopPropagation()}>
                        {rowActions(row)}
                      </div>
                    )}
                  </div>
                </li>
              ))}
            </ul>
          </Card>
        )}
      </div>

      {/* RIGHT — detail pane placeholder (desktop) when nothing selected */}
      {!selectedId && (
        <div className="hidden flex-1 lg:block">
          <EmptyState>Select an item to see its details.</EmptyState>
        </div>
      )}

      {/* Detail: inline pane on desktop, full-screen overlay on mobile */}
      <Outlet />

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
    </div>
  )
}
