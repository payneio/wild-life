import { useMemo, useRef, useState } from "react"
import { Home, Inbox as InboxIcon, Sparkles } from "lucide-react"
import { EntityPicker } from "@/components/graph/EntityPicker"
import { Card } from "@/components/ui/primitives"
import { Section } from "@/components/detail/kit"
import type { Body, createCrud } from "@/services/api/crud"
import { events, notes } from "@/services/api/hooks"
import { useEntityResolver } from "@/services/api/mentions"
import type { Entity, EntityType, EventItem, Note } from "@/services/api/types"

const norm = (t: string) => t.trim().toLowerCase()

/**
 * Triage surface for unrooted items. "Unrooted = unintentional" — everything here
 * lacks a primary link (`entity_type IS NULL`). Assign each a home (any entity) and
 * it leaves the inbox (the list re-filters via the SSE-driven invalidation).
 */

/** A one-shot "set home" picker: search any entity type, pick once, write both
 *  columns together — so an item never flickers out of the inbox mid-selection. */
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
          placeholder="Root to… (search any area, project, person…)"
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
  labelFor,
  dateFor,
  emptyMsg,
  headerExtra,
}: {
  title: string
  items: T[]
  crud: ReturnType<typeof createCrud<T>>
  labelFor: (i: T) => string
  dateFor: (i: T) => string | null
  emptyMsg: string
  headerExtra?: React.ReactNode
}) {
  const update = crud.useUpdate()
  const [selected, setSelected] = useState<Set<string>>(new Set())
  const shown = items.slice(0, 100)

  const root = (id: string, type: EntityType, entityId: string) =>
    update.mutate({ id, body: { entity_type: type, entity_id: entityId } as Body })
  const rootSelected = (type: EntityType, entityId: string) => {
    selected.forEach((id) => root(id, type, entityId))
    setSelected(new Set())
  }
  const toggle = (id: string) =>
    setSelected((s) => {
      const n = new Set(s)
      if (n.has(id)) n.delete(id)
      else n.add(id)
      return n
    })

  return (
    <Card className="p-4">
      <Section title={`${title} · ${items.length}`} action={headerExtra}>
        {items.length === 0 ? (
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
                  <HomePicker onPick={(type, id) => root(it.id, type, id)} />
                </li>
              ))}
            </ul>
            {items.length > shown.length && (
              <p className="pt-2 text-xs text-slate-400">Showing {shown.length} of {items.length}.</p>
            )}
            {selected.size > 0 && (
              <div className="sticky bottom-2 mt-3 flex items-center justify-between gap-3 rounded-xl border border-indigo-200 bg-indigo-50/80 px-3 py-2 backdrop-blur">
                <span className="text-sm font-medium text-indigo-800">Root {selected.size} selected</span>
                <HomePicker label="Root all to…" onPick={(type, id) => rootSelected(type, id)} />
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
          Unrooted items — give each an intentional home so it shows up in the right place and in reviews.
        </p>
      </div>

      <TriageSection<Note>
        title="Notes"
        items={noteRows}
        crud={notes}
        labelFor={(n) => n.title || n.body?.slice(0, 90) || ""}
        dateFor={(n) => n.entry_date}
        emptyMsg="Nothing unrooted — inbox zero. ✨"
      />

      <EventTriage />
    </div>
  )
}

// --- Events: grouped by title, root a whole group at once -------------------
// Synced calendars repeat the same meeting as many rows ("Therapy w/ Jessica"
// ×24). Grouping by title turns 1,000+ rows into a handful of decisions, and a
// home you've already assigned to that title is suggested for the rest.
function EventTriage() {
  const update = events.useUpdate()
  const resolve = useEntityResolver()
  const [showSynced, setShowSynced] = useState(false)
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
  const visible = unrooted.filter((e) => showSynced || !e.external_ref)
  const syncedHidden = unrooted.length - unrooted.filter((e) => !e.external_ref).length

  const groups = useMemo(() => {
    const g = new Map<string, EventItem[]>()
    for (const e of (unrootedData ?? []) as EventItem[]) {
      if (!showSynced && e.external_ref) continue
      const k = norm(e.title)
      const arr = g.get(k)
      if (arr) arr.push(e)
      else g.set(k, [e])
    }
    return [...g.entries()].sort((a, b) => b[1].length - a[1].length)
  }, [unrootedData, showSynced])

  const rootAll = (evs: EventItem[], type: EntityType, id: string) =>
    evs.forEach((e) => update.mutate({ id: e.id, body: { entity_type: type, entity_id: id } as Body }))

  const withSuggestion = groups.filter(([k]) => learned.has(k))
  const acceptAll = () =>
    withSuggestion.forEach(([k, evs]) => {
      const s = learned.get(k)!
      rootAll(evs, s.type, s.id)
    })

  return (
    <Card className="p-4">
      <Section
        title={`Events · ${visible.length}`}
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
            {syncedHidden > 0 ? "No un-synced events to triage." : "Nothing unrooted."}
          </p>
        ) : (
          <ul className="divide-y divide-slate-100">
            {groups.slice(0, 150).map(([k, evs]) => {
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
                      onClick={() => rootAll(evs, s.type, s.id)}
                      className="inline-flex shrink-0 items-center gap-1 rounded-lg border border-indigo-200 bg-indigo-50 px-2 py-1 text-xs font-medium text-indigo-700 transition hover:bg-indigo-100"
                    >
                      <Sparkles size={12} /> {resolve(s.type, s.id) ?? s.type}
                    </button>
                  ) : (
                    <HomePicker onPick={(type, id) => rootAll(evs, type, id)} />
                  )}
                </li>
              )
            })}
          </ul>
        )}
        {groups.length > 150 && (
          <p className="pt-2 text-xs text-slate-400">Showing 150 of {groups.length} groups.</p>
        )}
      </Section>
    </Card>
  )
}
