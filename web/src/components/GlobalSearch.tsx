import { useState } from "react"
import { useNavigate } from "react-router-dom"
import { Search, X } from "lucide-react"
import { Badge } from "@/components/ui/primitives"
import { Highlight } from "@/components/Highlight"
import { useSearch, type SearchHit } from "@/services/api/hooks"
import { routeFor, typeLabel } from "@/services/api/mentions"

/** Spotlight-style search across every entity (hits the /search endpoint). */
export function GlobalSearch() {
  const [q, setQ] = useState("")
  const [active, setActive] = useState(0)
  const navigate = useNavigate()
  const query = q.trim()
  const open = query.length >= 3
  const { data, isFetching } = useSearch(query)
  const results = (data ?? []).slice(0, 20)

  function go(r: SearchHit) {
    const to = routeFor(r.type, r.id)
    if (to) {
      setQ("")
      navigate(to)
    }
  }

  function onKey(e: React.KeyboardEvent) {
    if (!open) return
    if (e.key === "ArrowDown") {
      e.preventDefault()
      setActive((a) => Math.min(a + 1, results.length - 1))
    } else if (e.key === "ArrowUp") {
      e.preventDefault()
      setActive((a) => Math.max(a - 1, 0))
    } else if (e.key === "Enter") {
      e.preventDefault()
      const r = results[active]
      if (r) go(r)
    } else if (e.key === "Escape") {
      setQ("")
    }
  }

  return (
    <div className="relative">
      <div className="flex items-center gap-2 rounded-lg border border-slate-300 bg-white px-3 py-2 focus-within:border-indigo-500 focus-within:ring-2 focus-within:ring-indigo-100">
        <Search size={16} className="shrink-0 text-slate-400" />
        <input
          className="w-full text-sm outline-none"
          placeholder="Search everything — people, notes, places, projects…"
          value={q}
          onChange={(e) => {
            setQ(e.target.value)
            setActive(0)
          }}
          onKeyDown={onKey}
        />
        {q && (
          <button className="text-slate-300 hover:text-slate-500" onClick={() => setQ("")}>
            <X size={15} />
          </button>
        )}
      </div>

      {open && (
        <div className="absolute z-30 mt-1 max-h-[60vh] w-full overflow-y-auto rounded-lg border border-slate-200 bg-white shadow-lg">
          {isFetching && !data ? (
            <div className="px-3 py-3 text-sm text-slate-400">Searching…</div>
          ) : results.length === 0 ? (
            <div className="px-3 py-3 text-sm text-slate-400">No matches.</div>
          ) : (
            <ul className="py-1">
              {results.map((r, i) => (
                <li key={`${r.type}:${r.id}`}>
                  <button
                    className={`block w-full px-3 py-2 text-left ${i === active ? "bg-indigo-50" : "hover:bg-slate-50"}`}
                    onMouseEnter={() => setActive(i)}
                    onClick={() => go(r)}
                  >
                    <div className="flex items-baseline justify-between gap-2">
                      <span className="truncate text-sm font-medium text-slate-800">
                        <Highlight text={r.label} q={query} />
                      </span>
                      <Badge>{typeLabel(r.type)}</Badge>
                    </div>
                    {r.snippet && (
                      <p className="mt-0.5 line-clamp-1 text-xs text-slate-500">
                        <Highlight text={r.snippet} q={query} />
                      </p>
                    )}
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </div>
  )
}
