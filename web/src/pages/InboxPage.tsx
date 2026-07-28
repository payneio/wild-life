import { useMemo, useState } from "react"
import { Inbox as InboxIcon, Sparkles } from "lucide-react"
import { HomePicker } from "@/components/graph/HomePicker"
import { Card } from "@/components/ui/primitives"
import { Section } from "@/components/detail/kit"
import { showActionToast } from "@/lib/toast"
import { formatDate } from "@/lib/utils"
import { whenOf } from "@/lib/moments"
import type { Body } from "@/services/api/crud"
import { moments } from "@/services/api/hooks"
import { useEntityResolver } from "@/services/api/mentions"
import type { EntityType, Moment, MomentLink } from "@/services/api/types"

const norm = (t: string) => t.trim().toLowerCase()

/**
 * Triage for what was captured without saying what it is.
 *
 * The inbox is a **state, not a lack**: a `capture` is a moment whose kind the
 * creating surface could not resolve, because you typed something and never said
 * what it was about. That is now the whole definition, and it is finally
 * positive. Defining the surface by absence is what once put a 29-year archive
 * in a triage queue — every reflection looked unfiled because reflections have
 * no subject to be filed under, which is a fact about the writing, not a
 * backlog.
 *
 * Naming what a capture concerns resolves both at once: it gains a `subject`
 * link and becomes an `observation`. That is the one place in the app a kind is
 * decided by a person, and it is decided by the filing gesture rather than
 * asked as a question.
 */

/** Optimistic triage: hide filed rows instantly (the list is server-filtered, so
 *  the cache-merge alone wouldn't remove them), confirm with a toast, offer Undo. */
function useResolver() {
  const update = moments.useUpdate()
  const resolve = useEntityResolver()
  const [hidden, setHidden] = useState<Set<string>>(new Set())

  const fileMany = (rows: Moment[], type: EntityType, entityId: string) => {
    if (rows.length === 0) return
    for (const m of rows) {
      // Links reconcile wholesale, so the mentions the writing already carries
      // are sent back with the new subject or they would be deleted by the save.
      const kept = m.links.filter((l) => l.role !== "subject")
      const links: MomentLink[] = [
        { role: "subject", entity_type: type, entity_id: entityId },
        ...kept,
      ]
      update.mutate({ id: m.id, body: { kind: "observation", links } as Body })
    }
    setHidden((s) => new Set([...s, ...rows.map((m) => m.id)]))
    const label = resolve(type, entityId) ?? type
    const what = rows.length > 1 ? `${rows.length} captures` : "capture"
    showActionToast(`Filed ${what} in ${label}`, {
      label: "Undo",
      onClick: () => {
        for (const m of rows)
          update.mutate({ id: m.id, body: { kind: "capture", links: m.links } as Body })
        setHidden((s) => {
          const n = new Set(s)
          for (const m of rows) n.delete(m.id)
          return n
        })
      },
    })
  }
  return { hidden, fileMany }
}

function CaptureTriage() {
  const { hidden, fileMany } = useResolver()
  const [selected, setSelected] = useState<Set<string>>(new Set())
  const [limit, setLimit] = useState(100)
  const rows = (moments.useList({ kind: "capture", limit: "500" }).data ?? []) as Moment[]
  const visible = rows.filter((m) => !hidden.has(m.id))
  const shown = visible.slice(0, limit)
  const allSelected = visible.length > 0 && visible.every((m) => selected.has(m.id))

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
        title={`Captures · ${visible.length}`}
        action={
          visible.length > 0 ? (
            <button
              type="button"
              onClick={() => setSelected(allSelected ? new Set() : new Set(visible.map((m) => m.id)))}
              className="rounded-lg px-2 py-1 text-xs font-medium text-slate-500 transition hover:bg-slate-100 hover:text-slate-800"
            >
              {allSelected ? "Clear" : "Select all"}
            </button>
          ) : undefined
        }
      >
        {visible.length === 0 ? (
          <p className="py-4 text-sm text-slate-400">Nothing unresolved — inbox zero. ✨</p>
        ) : (
          <>
            <ul className="divide-y divide-slate-100">
              {shown.map((m) => {
                const when = whenOf(m)
                return (
                  <li key={m.id} className="flex items-center gap-3 py-2">
                    <input
                      type="checkbox"
                      className="h-4 w-4 shrink-0"
                      checked={selected.has(m.id)}
                      onChange={() => toggle(m.id)}
                    />
                    <div className="min-w-0 flex-1">
                      <div className="truncate text-sm text-slate-800">
                        {m.title || m.body?.slice(0, 90) || "(empty)"}
                      </div>
                      {when && <div className="text-xs text-slate-400">{formatDate(when)}</div>}
                    </div>
                    <HomePicker onPick={(type, id) => fileMany([m], type, id)} />
                  </li>
                )
              })}
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
                    fileMany(visible.filter((m) => selected.has(m.id)), type, id)
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
  return (
    <div className="mx-auto max-w-3xl space-y-5">
      <div>
        <h1 className="flex items-center gap-2 text-lg font-semibold text-slate-900">
          <InboxIcon size={20} className="text-slate-400" /> Inbox
        </h1>
        <p className="text-sm text-slate-500">
          Captured without saying what it's about — name the area, project, or person it
          concerns, and it becomes an observation filed there.
        </p>
      </div>

      <CaptureTriage />

      <EventTriage />
    </div>
  )
}

// --- Occasions: grouped by title, file a whole group at once ----------------
//
// Synced calendars repeat the same meeting as many rows ("Therapy w/ Jessica"
// ×24). Grouping by title turns a thousand rows into a handful of decisions, and
// a home already assigned to that title is suggested for the rest.
//
// Unlike a capture, an occasion's kind is not in doubt — it was a meeting either
// way. What is missing is only what it *concerned*, so filing writes a `subject`
// link and leaves the kind alone.
function EventTriage() {
  const resolve = useEntityResolver()
  const update = moments.useUpdate()
  const [hidden, setHidden] = useState<Set<string>>(new Set())
  const [showSynced, setShowSynced] = useState(false)
  const [glimit, setGlimit] = useState(150)
  const unfiledData = moments.useList({
    kind: "occasion",
    unfiled: "true",
    limit: "500",
  }).data
  const filedData = moments.useList({
    kind: "occasion",
    unfiled: "false",
    limit: "500",
  }).data

  const fileMany = (rows: Moment[], type: EntityType, entityId: string) => {
    if (rows.length === 0) return
    for (const m of rows) {
      // Everything but the subject is carried through: the participants an
      // invitation resolved and the place it named are not ours to drop.
      const kept = m.links.filter((l) => l.role !== "subject")
      const links: MomentLink[] = [
        { role: "subject", entity_type: type, entity_id: entityId },
        ...kept,
      ]
      update.mutate({ id: m.id, body: { links } as Body })
    }
    setHidden((s) => new Set([...s, ...rows.map((m) => m.id)]))
    const label = resolve(type, entityId) ?? type
    const what = rows.length > 1 ? `${rows.length} occasions` : "occasion"
    showActionToast(`Filed ${what} in ${label}`, {
      label: "Undo",
      onClick: () => {
        for (const m of rows) update.mutate({ id: m.id, body: { links: m.links } as Body })
        setHidden((s) => {
          const n = new Set(s)
          for (const m of rows) n.delete(m.id)
          return n
        })
      },
    })
  }

  // Learn a title → home map from what is already filed.
  const learned = useMemo(() => {
    const m = new Map<string, { type: EntityType; id: string }>()
    for (const occ of (filedData ?? []) as Moment[]) {
      const subject = occ.links.find((l) => l.role === "subject")
      const key = norm(occ.title ?? "")
      if (subject && key && !m.has(key))
        m.set(key, { type: subject.entity_type, id: subject.entity_id })
    }
    return m
  }, [filedData])

  const unfiled = ((unfiledData ?? []) as Moment[]).filter((m) => !hidden.has(m.id))
  // A synced meeting nobody filed is not a backlog, so it stays behind a reveal.
  const isSynced = (m: Moment) => (m.source_ref ?? "").startsWith("event:")
  const visible = unfiled.filter((m) => showSynced || !isSynced(m))
  const syncedHidden = unfiled.filter(isSynced).length

  const groups = useMemo(() => {
    const g = new Map<string, Moment[]>()
    for (const m of visible) {
      const k = norm(m.title ?? "")
      const arr = g.get(k)
      if (arr) arr.push(m)
      else g.set(k, [m])
    }
    return [...g.entries()].sort((a, b) => b[1].length - a[1].length)
  }, [visible])

  const withSuggestion = groups.filter(([k]) => learned.has(k))
  const acceptAll = () =>
    withSuggestion.forEach(([k, rows]) => {
      const s = learned.get(k)!
      fileMany(rows, s.type, s.id)
    })

  const countLabel =
    groups.length < visible.length ? `${visible.length} · ${groups.length} groups` : `${visible.length}`

  return (
    <Card className="p-4">
      <Section
        title={`Occasions with no subject · ${countLabel}`}
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
            {syncedHidden > 0 ? "No un-synced occasions to triage." : "Nothing unfiled. ✨"}
          </p>
        ) : (
          <ul className="divide-y divide-slate-100">
            {groups.slice(0, glimit).map(([k, rows]) => {
              const s = learned.get(k)
              return (
                <li key={k} className="flex items-center gap-3 py-2">
                  <div className="min-w-0 flex-1">
                    <div className="truncate text-sm text-slate-800">
                      {rows[0].title || "(untitled)"}
                      {rows.length > 1 && (
                        <span className="ml-1.5 rounded-full bg-slate-100 px-1.5 text-xs text-slate-500">
                          ×{rows.length}
                        </span>
                      )}
                    </div>
                  </div>
                  {s ? (
                    <button
                      type="button"
                      onClick={() => fileMany(rows, s.type, s.id)}
                      className="inline-flex shrink-0 items-center gap-1 rounded-lg border border-indigo-200 bg-indigo-50 px-2 py-1 text-xs font-medium text-indigo-700 transition hover:bg-indigo-100"
                    >
                      <Sparkles size={12} /> {resolve(s.type, s.id) ?? "…"}
                    </button>
                  ) : (
                    <HomePicker onPick={(type, id) => fileMany(rows, type, id)} />
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
