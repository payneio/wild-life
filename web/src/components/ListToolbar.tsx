import { Search } from "lucide-react"
import { Input, Select } from "@/components/ui/primitives"
import { humanize } from "@/lib/format"
import type { ListConfig } from "@/lib/listFilter"

export interface ToolbarProps {
  config: ListConfig
  search: string
  onSearch: (v: string) => void
  values: Record<string, string>
  onFilter: (field: string, v: string) => void
  sortKey: string
  onSort: (v: string) => void
  /** Present when this list has finished rows to account for. */
  closed?: { count: number; showing: boolean; onToggle: () => void }
  /** Drop the search box for a list short enough to read — a record's Log below
   *  the archive threshold, where a filter is still worth offering but a search
   *  over four entries is a box you'd have to scroll past. */
  hideSearch?: boolean
}

/** Consistent list toolbar: search + filter dropdowns + sort. */
export function ListToolbar({
  config,
  search,
  onSearch,
  values,
  onFilter,
  sortKey,
  onSort,
  closed,
  hideSearch,
}: ToolbarProps) {
  return (
    <div className="space-y-2">
      {!hideSearch && (
        <div className="relative">
          <Search
            size={15}
            className="pointer-events-none absolute top-1/2 left-2.5 -translate-y-1/2 text-slate-400"
          />
          <Input
            className="pl-8"
            placeholder="Search…"
            value={search}
            onChange={(e) => onSearch(e.target.value)}
          />
        </div>
      )}
      {(config.filters.length > 0 || config.sorts.length > 0) && (
        <div className="flex flex-wrap gap-2">
          {config.filters.map((f) => (
            <Select
              key={f.field}
              className="w-auto text-xs"
              value={values[f.field] ?? ""}
              onChange={(e) => onFilter(f.field, e.target.value)}
            >
              <option value="">All {f.label.toLowerCase()}</option>
              {f.options.map((o) => (
                <option key={o} value={o}>
                  {f.optionLabels?.[o] ?? humanize(o)}
                </option>
              ))}
            </Select>
          ))}
          {config.sorts.length > 0 && (
            <Select
              className="ml-auto w-auto text-xs"
              value={sortKey}
              onChange={(e) => onSort(e.target.value)}
            >
              {config.sorts.map((s) => (
                <option key={s.key} value={s.key}>
                  {s.label}
                </option>
              ))}
            </Select>
          )}
        </div>
      )}
      {closed && (
        <button
          type="button"
          onClick={closed.onToggle}
          className="text-xs text-slate-500 underline-offset-2 hover:text-slate-800 hover:underline"
        >
          {closed.showing ? `Hide ${closed.count} closed` : `Show ${closed.count} closed`}
        </button>
      )}
    </div>
  )
}
