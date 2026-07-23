import { useMemo, useRef, useState } from "react"
import { Home, Inbox as InboxIcon, Sparkles } from "lucide-react"
import { EntityPicker } from "@/components/graph/EntityPicker"
import { Card } from "@/components/ui/primitives"
import { Section } from "@/components/detail/kit"
import { showActionToast } from "@/lib/toast"
import type { Body, createCrud } from "@/services/api/crud"
import { events, notes } from "@/services/api/hooks"
import { useEntityResolver } from "@/services/api/mentions"
import type { Entity, EntityType, EventItem, Note } from "@/services/api/types"

const norm = (t: string) => t.trim().toLowerCase()

/**
 * Triage surface for unrooted items. "Unrooted = unintentional" — everything here
 * lacks a primary link (`entity_type IS NULL`). Assign each a home (any entity) and
 * it leaves the inbox immediately, with an Undo.
 */

/** Optimistic rooting: hide filed rows instantly (the list is server-filtered, so
 *  the cache-merge alone wouldn't remove them), confirm with a toast, offer Undo. */
function useRooter<T extends Entity>(crud: ReturnType<typeof createCrud<T>>, noun: string) {
  const update = crud.useUpdate()
  const resolve = useEntityResolver()
  const [hidden, setHidden] = useState<Set<string>>(new Set())

  const rootMany = (ids: string[], type: EntityType, entityId: string) => {
    if (ids.length === 0) return
    for (const id of ids) update.mutate({ id, body: { entity_type: type, entity_id: entityId } as Body })
    setHidden((s) => new Set([...s, ...ids]))
    const label = resolve(type, entityId) ?? type
    const what = ids.length > 1 ? `${ids.length} ${noun}s` : `${noun}`
    showActionToast(`Filed ${what} in ${label}`, {
      label: "Undo",
      onClick: () => {
        for (const id of ids) update.mutate({ id, body: { entity_type: null, entity_id: null } as Body })
        setHidden((s) => {
          const n = new Set(s)
          for (const id of ids) n.delete(id)
          return n
        })
      },
    })
  }
  return { hidden, rootMany }
}

/** A one-shot "set home" picker: search any entity type, pick once. */
function HomePicker({ label = "Set home…", onPick }: { label?: string; onPick: (type: EntityType, id: string) => void }) {
  const [open, setOpen] = useState(false)
  const ref = useRef<HTMLButtonElement>(null)
  return (
    <>
      <button
        ref={ref}
        type="button"
        onClick={() => setOpen(true)}
        className="inline-flex shrink-0 items-center gap-1 rounded-lg border border-slate-300 bg-surface px-2 py-1 text-xs font-medium text-slate-600 transition hover:border-slate-400 hover:text-slate-900"
      >
        <Home size={12} /> {label}
      </button>
      {open && (
        <EntityPicker
          getAnchor={() => ref.current}
          allowCreate={false}
          placeholder="File in… (search any area, project, person…)"
          onClose={() => setOpen(false)}
          onSelect={(r) => {
            onPick(r.type, r.id)
            setOpen(false)
          }}
        />
      )}
    </>
  )
}

function TriageSection<T extends Entity>({
  title,
  items,
  crud,
  noun,
  labelFor,
  dateFor,
  emptyMsg,
}: {
  title: string
  items: T[]
  crud: ReturnType<typeof createCrud<T>>
  noun: string
  labelFor: (i: T) => string
  dateFor: (i: T) => string | null
  emptyMsg: string
}) {
  const { hidden, rootMany } = useRooter(crud, noun)
  const [selected, setSelected] = useState<Set<string>>(new Set())
  const [limit, setLimit] = useState(100)
  const visible = items.filter((i) => !hidden.has(i.id))
  const shown = visible.slice(0, limit)
  const allSelected = visible.length > 0 && visible.every((i) => selected.has(i.id))

  const toggle = (id: string) =>
    setSelected((s) => {
      const n = new Set(s)
      if (n.has(id)) n.delete(id)
      else n.add(id)
      return n
    })

  return (
    <Card className="p-4">
      <Section
        title={`${title} · ${visible.length}`}
        action={
          visible.length > 0 ? (
            <button
              type="button"
              onClick={() => setSelected(allSelected ? new Set() : new Set(visible.map((i) => i.id)))}
              className="rounded-lg px-2 py-1 text-xs font-medium text-slate-500 transition hover:bg-slate-100 hover:text-slate-800"
            >
              {allSelected ? "Clear" : "Select all"}
            </button>
          ) : undefined
        }
      >
        {visible.length === 0 ? (
          <p className="py-4 text-sm text-slate-400">{emptyMsg}</p>
        ) : (
          <>
            <ul className="divide-y divide-slate-100">
              {shown.map((it) => (
                <li key={it.id} className="flex items-center gap-3 py-2">
                  <input
                    type="checkbox"
                    className="h-4 w-4 shrink-0"
                    checked={selected.has(it.id)}
                    onChange={() => toggle(it.id)}
                  />
                  <div className="min-w-0 flex-1">
                    <div className="truncate text-sm text-slate-800">{labelFor(it) || "(empty)"}</div>
                    {dateFor(it) && <div className="text-xs text-slate-400">{dateFor(it)}</div>}
                  </div>
                  <HomePicker onPick={(type, id) => rootMany([it.id], type, id)} />
                </li>
              ))}
            </ul>
            {visible.length > shown.length && (
              <button
                type="button"
                onClick={() => setLimit((l) => l + 100)}
                className="pt-2 text-xs font-medium text-indigo-600 hover:underline"
              >
                Show {Math.min(100, visible.length - shown.length)} more
              </button>
            )}
            {selected.size > 0 && (
              <div className="sticky bottom-2 mt-3 flex items-center justify-between gap-3 rounded-xl border border-indigo-200 bg-indigo-50/80 px-3 py-2 backdrop-blur">
                <span className="text-sm font-medium text-indigo-800">File {selected.size} selected</span>
                <HomePicker
                  label="File all in…"
                  onPick={(type, id) => {
                    rootMany([...selected].filter((id) => !hidden.has(id)), type, id)
                    setSelected(new Set())
                  }}
                />
              </div>
            )}
          </>
        )}
      </Section>
    </Card>
  )
}

export function InboxPage() {
  const noteRows = (notes.useList({ entity_type__isnull: "true" }).data ?? []) as Note[]

  return (
    <div className="mx-auto max-w-3xl space-y-5">
      <div>
        <h1 className="flex items-center gap-2 text-lg font-semibold text-slate-900">
          <InboxIcon size={20} className="text-slate-400" /> Inbox
        </h1>
        <p className="text-sm text-slate-500">
          Unrooted items — file each in the area, project, or person it belongs to, so it shows
          up in the right place and in reviews.
        </p>
      </div>

      <TriageSection<Note>
        title="Notes"
        items={noteRows}
        crud={notes}
        noun="note"
        labelFor={(n) => n.title || n.body?.slice(0, 90) || ""}
        dateFor={(n) => n.entry_date}
        emptyMsg="Nothing unfiled — inbox zero. ✨"
      />

      <EventTriage />
    </div>
  )
}

// --- Events: grouped by title, file a whole group at once -------------------
// Synced calendars repeat the same meeting as many rows ("Therapy w/ Jessica"
// ×24). Grouping by title turns 1,000+ rows into a handful of decisions, and a
// home you've already assigned to that title is suggested for the rest.
function EventTriage() {
  const resolve = useEntityResolver()
  const { hidden, rootMany } = useRooter(events, "event")
  const [showSynced, setShowSynced] = useState(false)
  const [glimit, setGlimit] = useState(150)
  const unrootedData = events.useList({ entity_type__isnull: "true" }).data
  const rootedData = events.useList({ entity_type__isnull: "false" }).data

  // Learn a title → home map from what's already rooted.
  const learned = useMemo(() => {
    const m = new Map<string, { type: EntityType; id: string }>()
    for (const e of (rootedData ?? []) as EventItem[])
      if (e.entity_type && e.entity_id && !m.has(norm(e.title)))
        m.set(norm(e.title), { type: e.entity_type, id: e.entity_id })
    return m
  }, [rootedData])

  const unrooted = (unrootedData ?? []) as EventItem[]
  const visible = unrooted.filter((e) => (showSynced || !e.external_ref) && !hidden.has(e.id))
  const syncedHidden = unrooted.filter((e) => e.external_ref && !hidden.has(e.id)).length

  const groups = useMemo(() => {
    const g = new Map<string, EventItem[]>()
    for (const e of visible) {
      const k = norm(e.title)
      const arr = g.get(k)
      if (arr) arr.push(e)
      else g.set(k, [e])
    }
    return [...g.entries()].sort((a, b) => b[1].length - a[1].length)
  }, [visible])

  const withSuggestion = groups.filter(([k]) => learned.has(k))
  const acceptAll = () =>
    withSuggestion.forEach(([k, evs]) => {
      const s = learned.get(k)!
      rootMany(evs.map((e) => e.id), s.type, s.id)
    })

  const countLabel =
    groups.length < visible.length ? `${visible.length} · ${groups.length} groups` : `${visible.length}`

  return (
    <Card className="p-4">
      <Section
        title={`Events · ${countLabel}`}
        action={
          <div className="flex items-center gap-1">
            {withSuggestion.length > 0 && (
              <button
                type="button"
                onClick={acceptAll}
                className="inline-flex items-center gap-1 rounded-lg bg-indigo-50 px-2 py-1 text-xs font-medium text-indigo-700 transition hover:bg-indigo-100"
              >
                <Sparkles size={12} /> Accept {withSuggestion.length} suggested
              </button>
            )}
            {syncedHidden > 0 && (
              <button
                type="button"
                onClick={() => setShowSynced((v) => !v)}
                className="rounded-lg px-2 py-1 text-xs font-medium text-slate-500 transition hover:bg-slate-100 hover:text-slate-800"
              >
                {showSynced ? "Hide synced" : `Show ${syncedHidden} synced`}
              </button>
            )}
          </div>
        }
      >
        {groups.length === 0 ? (
          <p className="py-4 text-sm text-slate-400">
            {syncedHidden > 0 ? "No un-synced events to triage." : "Nothing unfiled. ✨"}
          </p>
        ) : (
          <ul className="divide-y divide-slate-100">
            {groups.slice(0, glimit).map(([k, evs]) => {
              const s = learned.get(k)
              return (
                <li key={k} className="flex items-center gap-3 py-2">
                  <div className="min-w-0 flex-1">
                    <div className="truncate text-sm text-slate-800">
                      {evs[0].title || "(untitled)"}
                      {evs.length > 1 && (
                        <span className="ml-1.5 rounded-full bg-slate-100 px-1.5 text-xs text-slate-500">
                          ×{evs.length}
                        </span>
                      )}
                    </div>
                  </div>
                  {s ? (
                    <button
                      type="button"
                      onClick={() => rootMany(evs.map((e) => e.id), s.type, s.id)}
                      className="inline-flex shrink-0 items-center gap-1 rounded-lg border border-indigo-200 bg-indigo-50 px-2 py-1 text-xs font-medium text-indigo-700 transition hover:bg-indigo-100"
                    >
                      <Sparkles size={12} /> {resolve(s.type, s.id) ?? "…"}
                    </button>
                  ) : (
                    <HomePicker onPick={(type, id) => rootMany(evs.map((e) => e.id), type, id)} />
                  )}
                </li>
              )
            })}
          </ul>
        )}
        {groups.length > glimit && (
          <button
            type="button"
            onClick={() => setGlimit((l) => l + 150)}
            className="pt-2 text-xs font-medium text-indigo-600 hover:underline"
          >
            Show {Math.min(150, groups.length - glimit)} more
          </button>
        )}
      </Section>
    </Card>
  )
}
