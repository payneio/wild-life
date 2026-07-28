import { useMemo } from "react"
import type { FieldSpec } from "@/services/api/fieldSpec"
import type { ToolbarProps } from "@/components/ListToolbar"
import { usePersistentState } from "@/lib/persistentState"
import { isTerminal } from "@/services/api/lifecycle"
import type { EntityType } from "@/services/api/types"

export interface FilterDef {
  field: string
  label: string
  options: readonly string[]
  /** Value → display label, for reference filters whose values are opaque ids. */
  optionLabels?: Record<string, string>
}
export interface SortDef {
  key: string
  label: string
  field: string
  desc?: boolean
}
export interface ListConfig {
  searchKeys: string[]
  filters: FilterDef[]
  sorts: SortDef[]
}

const TEXTLIKE = new Set<string | undefined>(["text", "textarea", undefined])

/** Build a reference filter (opaque ids as values, entity names as labels). */
export function refFilter(
  field: string,
  label: string,
  items: { id: string; name?: string; title?: string }[],
): FilterDef {
  return {
    field,
    label,
    options: items.map((i) => i.id),
    optionLabels: Object.fromEntries(items.map((i) => [i.id, i.name ?? i.title ?? i.id])),
  }
}

/**
 * Derive sensible search/filter/sort config from an entity's edit FieldSpecs:
 * text fields → search, select fields → filter dropdowns (max 3), plus A–Z /
 * Recent sorts. Pass an explicit `ListConfig` only where these defaults are wrong.
 */
export function deriveListConfig(fields: FieldSpec[], primaryKey: string): ListConfig {
  const searchKeys = Array.from(
    new Set([primaryKey, ...fields.filter((f) => TEXTLIKE.has(f.type)).map((f) => f.name)]),
  )
  const filters: FilterDef[] = fields
    .filter((f) => f.type === "select" && f.options && f.options.length > 0)
    .slice(0, 3)
    .map((f) => ({ field: f.name, label: f.label, options: f.options as readonly string[] }))
  const sorts: SortDef[] = [
    { key: "az", label: "A–Z", field: primaryKey },
    { key: "recent", label: "Recent", field: "updated_at", desc: true },
  ]
  return { searchKeys, filters, sorts }
}

/**
 * Client-side search/filter/sort over `rows` per `config`. Returns the filtered
 * rows plus the props for a `<ListToolbar>` so every list stays consistent.
 * Pass a `storageKey` to persist the search/filter/sort selections across reloads.
 */
export function useListFilter<T extends Record<string, unknown>>(
  rows: T[],
  config: ListConfig | ((values: Record<string, string>) => ListConfig),
  storageKey?: string,
  /** Enables the hide-closed default; omit for types with no lifecycle. */
  entityType?: EntityType,
  /** Filter values a list opens on — for a list that *is* a subset (the Journal
   *  is one person's notes), so the subset is a default the user can widen out
   *  of rather than a query they can't see. A persisted choice overrides this
   *  wholesale, so changing the shape of a list means changing its storage key. */
  initialValues?: Record<string, string>,
): { filtered: T[]; toolbarProps: ToolbarProps; closedCount: number } {
  const [search, setSearch] = usePersistentState(storageKey ? `${storageKey}:q` : null, "")
  const [values, setValues] = usePersistentState<Record<string, string>>(
    storageKey ? `${storageKey}:f` : null,
    initialValues ?? {},
  )
  // Config may depend on the current filter values (e.g. narrow a Program filter
  // to the selected Area). For a static config `cfg` is a stable reference.
  const cfg = typeof config === "function" ? config(values) : config
  const [sortKey, setSortKey] = usePersistentState(
    storageKey ? `${storageKey}:s` : null,
    cfg.sorts[0]?.key ?? "",
  )
  // Finished records are hidden by default and their count is always shown, so
  // the list never quietly under-reports itself. Persisted, so revealing sticks.
  const [showClosed, setShowClosed] = usePersistentState(
    storageKey ? `${storageKey}:closed` : null,
    false,
  )
  // An explicit status choice outranks the default — otherwise picking
  // "archived" from the dropdown would return an empty list, which is the same
  // lie in a different place.
  const statusPicked = !!values.status
  const hideClosed = !!entityType && !showClosed && !statusPicked
  const closedCount = useMemo(
    () => (entityType ? rows.filter((r) => isTerminal(entityType, r.status)).length : 0),
    [rows, entityType],
  )

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase()
    const out = rows.filter((r) => {
      if (hideClosed && entityType && isTerminal(entityType, r.status)) return false
      for (const f of cfg.filters) {
        const v = values[f.field]
        if (v && String(r[f.field] ?? "") !== v) return false
      }
      if (!q) return true
      return cfg.searchKeys.some((k) =>
        String(r[k] ?? "")
          .toLowerCase()
          .includes(q),
      )
    })
    const sort = cfg.sorts.find((s) => s.key === sortKey)
    if (sort && sort.field) {
      out.sort((a, b) => {
        const cmp = String(a[sort.field] ?? "").localeCompare(String(b[sort.field] ?? ""))
        return sort.desc ? -cmp : cmp
      })
    }
    return out
  }, [rows, search, values, sortKey, cfg, hideClosed, entityType])

  const toolbarProps: ToolbarProps = {
    config: cfg,
    search,
    onSearch: setSearch,
    values,
    onFilter: (field, v) => setValues((p) => ({ ...p, [field]: v })),
    sortKey,
    onSort: setSortKey,
    closed:
      closedCount > 0 && !statusPicked
        ? { count: closedCount, showing: showClosed, onToggle: () => setShowClosed((v) => !v) }
        : undefined,
  }
  return { filtered, toolbarProps, closedCount: hideClosed ? closedCount : 0 }
}
