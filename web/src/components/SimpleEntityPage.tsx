import { useMemo, type ReactNode } from "react"
import { Outlet, useNavigate, useParams } from "react-router-dom"
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
  emptyText = "Nothing here yet.",
  extraFilters,
  detail = "pane",
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
  /** How the detail opens: "pane" (Directory — beside the list) or "page"
   *  (Workbench — the list is a full-width launcher; rows open a full page). */
  detail?: "pane" | "page"
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

  // Workbench: the list is a full-width launcher; rows open a full page elsewhere.
  if (detail === "page") {
    return (
      <div className="mx-auto max-w-3xl space-y-3">
        {listContent}
      </div>
    )
  }

  // Directory: compact list + detail pane on desktop, full-screen overlay on mobile.
  return (
    <div className="flex flex-col gap-4 lg:flex-row">
      <div className="space-y-3 lg:w-96 lg:shrink-0">{listContent}</div>
      {!selectedId && (
        <div className="hidden flex-1 lg:block">
          <EmptyState>Select an item to see its details.</EmptyState>
        </div>
      )}
      <Outlet />
    </div>
  )
}
