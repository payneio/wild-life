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
}: ToolbarProps) {
  return (
    <div className="space-y-2">
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
                  {humanize(o)}
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
    </div>
  )
}
