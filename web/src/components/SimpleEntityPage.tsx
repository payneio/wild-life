import { useMemo, type ReactNode } from "react"
import { useNavigate, useParams } from "react-router-dom"
import { Card, EmptyState } from "@/components/ui/primitives"
import { QuickCreate } from "@/components/QuickCreate"
import type { FieldSpec } from "@/services/api/fieldSpec"
import { ListToolbar } from "@/components/ListToolbar"
import { deriveListConfig, useListFilter, type FilterDef } from "@/lib/listFilter"
import { cn } from "@/lib/utils"
import type { createCrud } from "@/services/api/crud"
import type { Body } from "@/services/api/crud"
import type { Entity, EntityType } from "@/services/api/types"
import { entityTypeForResource } from "@/services/api/registry"

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

const slug = (s: string) =>
  s
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "")

/**
 * A launcher: search/filter toolbar, one-line capture, and rows that open a
 * full-page record at a sibling `/<thing>/:id` route.
 *
 * There is no pane variant any more. Framing used to be a per-entity choice —
 * "Directory" beside a list vs "Workbench" full-page — but every record now
 * carries a Log you write into, and a 384px column is not somewhere you write.
 * One framing also means one answer to where a detail appears.
 */
export function SimpleEntityPage<T extends Entity>({
  title,
  subtitle,
  crud,
  fields,
  columns,
  newLabel = "New",
  emptyText = "Nothing here yet.",
  extraFilters,
  entityType,
}: {
  title: string
  subtitle?: string
  crud: Crud<T>
  fields: FieldSpec[]
  /** Enables the hide-closed default. Omit for types with no lifecycle status. */
  entityType?: EntityType

  columns: Column<T>[]
  newLabel?: string
  emptyText?: string
  /** Extra filters (e.g. reference filters like Area) prepended to the derived
   *  select filters. Receives current filter values so options can depend on
   *  another filter (e.g. narrow Program to the selected Area). */
  extraFilters?: (values: Record<string, string>) => FilterDef[]
}) {
  const navigate = useNavigate()
  const { id: selectedId } = useParams()
  // Falls back to the registry, so every generic list gets the hide-closed
  // default without 23 pages each restating what they already are.
  const lifecycleType = entityType ?? entityTypeForResource(crud.resource)
  const { data, isLoading } = crud.useList()
  const create = crud.useCreate()
  const rows = useMemo(() => data ?? [], [data])

  const primaryKey = columns[0]?.key ?? "name"
  const { filtered, toolbarProps, closedCount } = useListFilter(
    rows as unknown as Record<string, unknown>[],
    (values) => {
      const base = deriveListConfig(fields, primaryKey)
      if (!extraFilters) return base
      return { ...base, filters: [...extraFilters(values), ...base.filters] }
    },
    `list:${slug(title)}`,
    lifecycleType,
  )
  const list = filtered as unknown as T[]

  const listContent = (
    <>
      <div className="flex items-end justify-between gap-2">
        <div className="min-w-0">
          <h1 className="text-lg font-semibold text-slate-900">{title}</h1>
          {subtitle && <p className="truncate text-sm text-slate-500">{subtitle}</p>}
        </div>
      </div>

      {/* Capture, not form-filling: the name is all that's required, and every
          other field lives in the detail this row opens. */}
      <QuickCreate
        placeholder={`${newLabel}…`}
        onCreate={(title) => create.mutate({ [primaryKey]: title } as Body)}
      />

      <ListToolbar {...toolbarProps} />

      {isLoading ? (
        <EmptyState>Loading…</EmptyState>
      ) : rows.length === 0 ? (
        <EmptyState>{emptyText}</EmptyState>
      ) : list.length === 0 ? (
        <EmptyState>
          {closedCount > 0
            ? `No matches — ${closedCount} closed hidden.`
            : "No matches."}
        </EmptyState>
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
                    <div className="break-words text-sm font-medium text-slate-800">
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
                </div>
              </li>
            ))}
          </ul>
        </Card>
      )}
    </>
  )

  return <div className="mx-auto max-w-3xl space-y-3">{listContent}</div>
}
