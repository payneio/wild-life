import { useMemo } from "react"
import type { FieldSpec } from "@/components/EntityForm"
import type { ToolbarProps } from "@/components/ListToolbar"
import { usePersistentState } from "@/lib/persistentState"

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
): { filtered: T[]; toolbarProps: ToolbarProps } {
  const [search, setSearch] = usePersistentState(storageKey ? `${storageKey}:q` : null, "")
  const [values, setValues] = usePersistentState<Record<string, string>>(
    storageKey ? `${storageKey}:f` : null,
    {},
  )
  // Config may depend on the current filter values (e.g. narrow a Program filter
  // to the selected Area). For a static config `cfg` is a stable reference.
  const cfg = typeof config === "function" ? config(values) : config
  const [sortKey, setSortKey] = usePersistentState(
    storageKey ? `${storageKey}:s` : null,
    cfg.sorts[0]?.key ?? "",
  )

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase()
    const out = rows.filter((r) => {
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
  }, [rows, search, values, sortKey, cfg])

  const toolbarProps: ToolbarProps = {
    config: cfg,
    search,
    onSearch: setSearch,
    values,
    onFilter: (field, v) => setValues((p) => ({ ...p, [field]: v })),
    sortKey,
    onSort: setSortKey,
  }
  return { filtered, toolbarProps }
}
