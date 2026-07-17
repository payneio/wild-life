import { useState } from "react"
import { Plus } from "lucide-react"
import { Input } from "@/components/ui/primitives"
import { PickerOverlay } from "@/components/graph/PickerOverlay"
import { useEntityCreators } from "@/services/api/creators"
import { typeLabel, useEntitySearch, type MentionResult } from "@/services/api/mentions"
import type { Body } from "@/services/api/crud"
import type { EntityType } from "@/services/api/types"

/**
 * The one canonical relationship picker. A search-first typeahead over the
 * registry-driven entity index (`useEntitySearch`), rendered in a responsive
 * `PickerOverlay` (popover on desktop, bottom sheet on mobile). Optionally
 * restrict to one `type` and exclude an id.
 *
 * When restricted to a quick-creatable `type`, a trailing "＋ Create '<query>'"
 * row appears once the query has no exact match — creating the row inline (with
 * any `createDefaults`, e.g. an inherited parent FK) and selecting it.
 */
export function EntityPicker({
  getAnchor,
  onSelect,
  onClose,
  placeholder = "Search…",
  type,
  excludeId,
  allowCreate = true,
  createDefaults,
}: {
  getAnchor: () => HTMLElement | null
  onSelect: (r: MentionResult) => void
  onClose: () => void
  placeholder?: string
  type?: EntityType
  excludeId?: string
  allowCreate?: boolean
  createDefaults?: Body
}) {
  const [q, setQ] = useState("")
  const [active, setActive] = useState(0)
  const [busy, setBusy] = useState(false)
  const results = useEntitySearch(q, { type, excludeId }).slice(0, 20)
  const creators = useEntityCreators()

  const trimmed = q.trim()
  const creator = allowCreate && type ? creators[type] : undefined
  const exact = results.some((r) => r.label.toLowerCase() === trimmed.toLowerCase())
  const canCreate = !!creator && trimmed.length > 0 && !exact
  const createIndex = results.length // create row sits after the results
  const count = results.length + (canCreate ? 1 : 0)

  async function create() {
    if (!creator || busy) return
    setBusy(true)
    try {
      onSelect(await creator(trimmed, createDefaults))
    } finally {
      setBusy(false)
    }
  }

  function key(e: React.KeyboardEvent) {
    if (e.key === "ArrowDown") {
      e.preventDefault()
      setActive((a) => Math.min(a + 1, count - 1))
    } else if (e.key === "ArrowUp") {
      e.preventDefault()
      setActive((a) => Math.max(a - 1, 0))
    } else if (e.key === "Enter") {
      e.preventDefault()
      if (canCreate && active === createIndex) return void create()
      const r = results[active]
      if (r) onSelect(r)
    }
  }

  return (
    <PickerOverlay getAnchor={getAnchor} onClose={onClose}>
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
      <ul className="max-h-72 overflow-y-auto pb-1">
        {results.length === 0 && !canCreate ? (
          <li className="px-3 py-2 text-sm text-slate-400">No matches.</li>
        ) : (
          results.map((r, i) => (
            <li key={`${r.type}:${r.id}`}>
              <button
                type="button"
                className={`flex w-full items-center justify-between gap-2 px-3 py-2 text-left text-sm ${
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
        {canCreate && (
          <li>
            <button
              type="button"
              disabled={busy}
              className={`flex w-full items-center gap-2 px-3 py-2 text-left text-sm ${
                active === createIndex ? "bg-indigo-50" : "hover:bg-slate-50"
              }`}
              onMouseEnter={() => setActive(createIndex)}
              onClick={create}
            >
              <Plus size={14} className="shrink-0 text-indigo-600" />
              <span className="truncate text-slate-700">
                {busy ? "Creating…" : "Create"}{" "}
                <span className="font-medium text-slate-900">“{trimmed}”</span>
              </span>
              {type && (
                <span className="ml-auto shrink-0 text-xs text-slate-400">{typeLabel(type)}</span>
              )}
            </button>
          </li>
        )}
      </ul>
    </PickerOverlay>
  )
}
