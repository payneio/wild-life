import { useRef, useState } from "react"
import { Plus } from "lucide-react"
import { StatusBadge } from "@/components/cells"
import { Input } from "@/components/ui/primitives"
import { useEntityCreators } from "@/services/api/creators"
import { humanize } from "@/lib/format"
import {
  typeLabel,
  useEntitySearch,
  type MentionResult,
  type PickerIntent,
  type PickerRow,
} from "@/services/api/mentions"
import type { Body } from "@/services/api/crud"
import type { EntityType } from "@/services/api/types"

/**
 * The shared innards of both pickers — search input, keyboard navigation, rows,
 * and the three "what you can't see" footers. `EntityPicker` wraps this in a
 * `PickerOverlay` (popover / bottom sheet); `EntityCombobox` wraps it in a plain
 * bordered box.
 *
 * It lives in one file because the two components were already ~85% identical and
 * this logic — hidden rows, truncation, exact-match-vs-create — is exactly the
 * kind that drifts when it's written twice.
 */
export function PickerBody({
  onSelect,
  onClose,
  placeholder = "Search…",
  type,
  excludeId,
  intent,
  allowCreate = false,
  createDefaults,
  limit,
  listClassName = "max-h-72",
}: {
  onSelect: (r: MentionResult) => void
  onClose?: () => void
  placeholder?: string
  type?: EntityType
  excludeId?: string
  intent: PickerIntent
  allowCreate?: boolean
  createDefaults?: Body
  /** Rows rendered before the picker stops and says how many it withheld. */
  limit?: number
  listClassName?: string
}) {
  const [q, setQ] = useState("")
  const [active, setActive] = useState(0)
  const [busy, setBusy] = useState(false)
  const [revealed, setRevealed] = useState(false)
  const inputRef = useRef<HTMLInputElement>(null)
  const { shown, hidden, truncated, exact } = useEntitySearch(q, { type, excludeId, intent, limit })
  const creators = useEntityCreators()

  // An exact match that was hidden is the one row you must always see: it is
  // precisely the row you would otherwise duplicate.
  const pinnedExact = exact?.terminal && !revealed ? exact : undefined
  const rows: PickerRow[] = revealed
    ? [...shown, ...hidden]
    : pinnedExact
      ? [...shown, pinnedExact]
      : shown

  const trimmed = q.trim()
  const creator = allowCreate && type ? creators[type] : undefined
  // A metric, a metric group, an outcome and a project are all rooted or
  // parented at birth. Offering "Create" without that context posted a title
  // alone and got a 422 back, so the offer is conditional on the caller having
  // handed over everything the type asks for.
  const equipped = !!creator && creator.requires.every((f) => createDefaults?.[f] != null)
  // `exact` comes from the *unfiltered* set, so hiding an archived "Atlas" can
  // never make the picker offer to create a second one.
  const canCreate = equipped && trimmed.length > 0 && !exact
  const createIndex = rows.length
  const count = rows.length + (canCreate ? 1 : 0)

  async function create() {
    if (!creator || busy) return
    setBusy(true)
    try {
      onSelect(await creator.create(trimmed, createDefaults))
    } finally {
      setBusy(false)
    }
  }

  function reveal() {
    setRevealed(true)
    setActive(0)
    // The reveal button unmounts on click; without this, focus falls to <body>
    // and keyboard navigation dies just as the list gets longer.
    inputRef.current?.focus()
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
      const r = rows[active]
      if (r) onSelect(r)
    } else if (e.key === "Escape") {
      e.preventDefault()
      onClose?.()
    }
  }

  // Name the reason rather than the mechanism: "archived or completed", not
  // "terminal". Built from the statuses actually present so it never claims a
  // state that isn't there.
  const hiddenStatuses = [...new Set(hidden.map((r) => r.status).filter(Boolean))] as string[]
  const hiddenReason = hiddenStatuses.map(humanize).join(" or ").toLowerCase()

  return (
    <>
      <div className="p-1.5">
        <Input
          ref={inputRef}
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
      <ul className={`${listClassName} overflow-y-auto pb-1`}>
        {rows.length === 0 && !canCreate && hidden.length === 0 && (
          <li className="px-3 py-2 text-sm text-slate-400">No matches.</li>
        )}
        {rows.map((r, i) => (
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
              <span className="flex shrink-0 items-center gap-1.5">
                {r.terminal && r.status && <StatusBadge status={r.status} />}
                {/* Scoped to one type, the type name is the same word on every
                    row; spend the slot on what actually tells rows apart. */}
                <span className="text-xs text-slate-400">
                  {type ? r.context : typeLabel(r.type)}
                </span>
              </span>
            </button>
          </li>
        ))}
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

      {/* Account for what was removed — a picker that silently drops options is
          the defect this whole change exists to fix. */}
      {hidden.length > 0 && !revealed && (
        <button
          type="button"
          onClick={reveal}
          className="flex w-full items-center justify-between gap-2 border-t border-slate-100 px-3 py-2 text-left text-xs text-slate-500 hover:bg-slate-50"
        >
          <span className="truncate">
            {hidden.length} {hiddenReason || "finished"} hidden
          </span>
          <span className="shrink-0 font-medium text-indigo-600">Show</span>
        </button>
      )}
      {truncated > 0 && (
        <p className="border-t border-slate-100 px-3 py-2 text-xs text-slate-400">
          {truncated} more — keep typing to narrow.
        </p>
      )}
    </>
  )
}
