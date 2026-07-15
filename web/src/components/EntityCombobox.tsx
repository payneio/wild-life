import { useState } from "react"
import { Input } from "@/components/ui/primitives"
import { typeLabel, useEntitySearch, type MentionResult } from "@/services/api/mentions"
import type { EntityType } from "@/services/api/types"

/** Typeahead over mentionable entities. Optionally restrict to one type / exclude an id. */
export function EntityCombobox({
  onSelect,
  onClose,
  placeholder = "Search people, places, projects…",
  type,
  excludeId,
}: {
  onSelect: (r: MentionResult) => void
  onClose?: () => void
  placeholder?: string
  type?: EntityType
  excludeId?: string
}) {
  const [q, setQ] = useState("")
  const [active, setActive] = useState(0)
  const results = useEntitySearch(q, { type, excludeId }).slice(0, 20)

  function key(e: React.KeyboardEvent) {
    if (e.key === "ArrowDown") {
      e.preventDefault()
      setActive((a) => Math.min(a + 1, results.length - 1))
    } else if (e.key === "ArrowUp") {
      e.preventDefault()
      setActive((a) => Math.max(a - 1, 0))
    } else if (e.key === "Enter") {
      e.preventDefault()
      const r = results[active]
      if (r) onSelect(r)
    } else if (e.key === "Escape") {
      e.preventDefault()
      onClose?.()
    }
  }

  return (
    <div className="w-72 rounded-lg border border-slate-200 bg-white shadow-lg">
      <div className="p-1.5">
        <Input
          autoFocus
          value={q}
          placeholder={placeholder}
          onChange={(e) => {
            setQ(e.target.value)
            setActive(0)
          }}
          onKeyDown={key}
        />
      </div>
      <ul className="max-h-64 overflow-y-auto pb-1">
        {results.length === 0 ? (
          <li className="px-3 py-2 text-sm text-slate-400">No matches.</li>
        ) : (
          results.map((r, i) => (
            <li key={`${r.type}:${r.id}`}>
              <button
                type="button"
                className={`flex w-full items-center justify-between gap-2 px-3 py-1.5 text-left text-sm ${
                  i === active ? "bg-indigo-50" : "hover:bg-slate-50"
                }`}
                onMouseEnter={() => setActive(i)}
                onClick={() => onSelect(r)}
              >
                <span className="truncate text-slate-700">{r.label}</span>
                <span className="shrink-0 text-xs text-slate-400">{typeLabel(r.type)}</span>
              </button>
            </li>
          ))
        )}
      </ul>
    </div>
  )
}
