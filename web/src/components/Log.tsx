import { memo, useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from "react"
import { Link, useNavigate, useParams } from "react-router-dom"
import { ChevronLeft, ChevronRight, Folder, Link2, Pencil, Trash2 } from "lucide-react"
import { Backlinks } from "@/components/Backlinks"
import { ListToolbar } from "@/components/ListToolbar"
import { MentionChip } from "@/components/MentionChip"
import { MentionText } from "@/components/MentionText"
import { MomentComposer } from "@/components/MomentComposer"
import { Card, EmptyState } from "@/components/ui/primitives"
import { useListFilter, type FilterDef, type ListConfig } from "@/lib/listFilter"
import type { Body } from "@/services/api/crud"
import {
  moments,
  useCreateMomentWithImages,
  useMomentCorpus,
  useMomentsCalendar,
  useMomentYear,
  TIMELINE_ROLES,
  type MomentScope,
} from "@/services/api/hooks"
import { formatDate } from "@/lib/utils"
import { useEntityResolver } from "@/services/api/mentions"
import { routeFor } from "@/services/api/routes"
import type { EntityType, Moment, MomentKind } from "@/services/api/types"
import {
  describeMoment,
  groupMomentsByDay,
  isLapsed,
  isProse,
  KIND_CLASS,
  KIND_LABEL,
  routeForMoment,
  subjectOf,
  whenOf,
} from "@/lib/moments"

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"]

function entryTime(m: Moment): string {
  // An all-day moment has no clock time to show — it was anchored to noon so the
  // day would render right, and printing "12:00 PM" would be reporting that
  // anchor as though it were an observation.
  if (m.all_day) return ""
  const stamp = whenOf(m) ?? m.created_at
  const d = new Date(stamp)
  if (Number.isNaN(d.getTime())) return ""
  return d.toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" })
}

function KindBadge({ kind }: { kind: MomentKind }) {
  return (
    <span className={`rounded px-1.5 py-0.5 text-[10px] font-medium uppercase tracking-wide ${KIND_CLASS[kind]}`}>
      {KIND_LABEL[kind]}
    </span>
  )
}

/** The chips for what a moment involves, minus the subject the header already
 *  names — repeating it is what made 18 of 20 backlink rows duplicates. */
function Involves({ moment }: { moment: Moment }) {
  const resolve = useEntityResolver()
  const subject = subjectOf(moment)
  const rest = moment.links.filter(
    (l) => !(l.role === "subject" && l.entity_id === subject?.entity_id),
  )
  if (rest.length === 0) return null
  return (
    <div className="flex flex-wrap items-center gap-1.5 pt-0.5">
      {rest.map((l) => (
        <MentionChip
          key={`${l.role}:${l.entity_type}:${l.entity_id}`}
          type={l.entity_type}
          id={l.entity_id}
          label={resolve(l.entity_type, l.entity_id) ?? "…"}
        />
      ))}
    </div>
  )
}

// --- one written entry in the stream ----------------------------------------
// Memoized with stable id-taking callbacks so that when one moment updates
// (e.g. an optimistic edit), only that one re-renders — the other ~130 entries
// keep their props and skip the (expensive, markdown-heavy) render entirely.
const ProseEntry = memo(function ProseEntry({
  moment,
  focused,
  base,
  showKind,
  onEdit,
  onDelete,
}: {
  moment: Moment
  focused: boolean
  base: string
  /** Off in a single-kind stream (the Journal), where every badge would say the
   *  same word; on in a record's mixed timeline, where the act is the news. */
  showKind: boolean
  onEdit: (id: string) => void
  onDelete: (id: string) => void
}) {
  const resolve = useEntityResolver()
  const navigate = useNavigate()
  const subject = subjectOf(moment)
  return (
    <Card
      className={`group space-y-2 p-4 transition ${
        focused ? "ring-2 ring-indigo-300" : ""
      }`}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="flex flex-wrap items-center gap-2 text-xs text-slate-400">
          {showKind && <KindBadge kind={moment.kind} />}
          <span>{entryTime(moment)}</span>
        </div>
        {/* Reveal on hover for pointer devices; always visible on touch (no
            hover) — otherwise entries can't be edited/deleted on mobile. */}
        <div className="flex gap-0.5 opacity-100 transition [@media(hover:hover)]:opacity-0 [@media(hover:hover)]:group-hover:opacity-100">
          <button
            className="rounded p-1 text-slate-400 hover:bg-slate-100 hover:text-slate-700"
            title="Permalink"
            onClick={() => navigate(`${base}/${moment.id}`)}
          >
            <Link2 size={14} />
          </button>
          <button
            className="rounded p-1 text-slate-400 hover:bg-slate-100 hover:text-slate-700"
            title="Edit"
            onClick={() => onEdit(moment.id)}
          >
            <Pencil size={14} />
          </button>
          <button
            className="rounded p-1 text-slate-400 hover:bg-red-50 hover:text-red-600"
            title="Delete"
            onClick={() => onDelete(moment.id)}
          >
            <Trash2 size={14} />
          </button>
        </div>
      </div>

      {subject && (
        <button
          type="button"
          title="About"
          onClick={() => {
            const to = routeFor(subject.entity_type, subject.entity_id)
            if (to) navigate(to)
          }}
          className="inline-flex w-fit items-center gap-1 rounded-md bg-indigo-600 px-2 py-0.5 text-xs font-medium text-white transition hover:bg-indigo-700"
        >
          <Folder size={11} /> {resolve(subject.entity_type, subject.entity_id) ?? "…"}
        </button>
      )}

      {moment.title && <h3 className="text-sm font-semibold text-slate-900">{moment.title}</h3>}

      <MentionText>{moment.body || "_Empty entry._"}</MentionText>

      <Involves moment={moment} />

      {focused && <Backlinks type="moment" id={moment.id} />}
    </Card>
  )
})

// --- one recorded (not written) moment --------------------------------------
/**
 * A dose, an occasion, a completed task. These are facts another surface
 * authored and `POST /moments/sync` still mirrors, so they are shown, not
 * edited: the row is a projection, and a change here would be overwritten the
 * next time the tick read its source. Clicking goes to the surface that owns it.
 *
 * This is the `ProgramTimeline` fold. That band rendered a program's events as a
 * dated list because events are temporal and had earned it; every kind of moment
 * has the same claim, so the Log renders all of them and there is no longer a
 * second dated sequence on the page to choose between.
 */
const RecordedRow = memo(function RecordedRow({ moment }: { moment: Moment }) {
  const resolve = useEntityResolver()
  const to = routeForMoment(moment)
  const lapsed = isLapsed(moment)
  return (
    <Link
      to={to}
      className="flex items-center gap-2.5 rounded-lg border border-slate-100 bg-surface px-3 py-2 text-sm transition hover:bg-slate-50"
    >
      <KindBadge kind={moment.kind} />
      <span className="min-w-0 flex-1 truncate text-slate-700">
        {describeMoment(moment, resolve)}
      </span>
      {moment.withdrawn_at ? (
        <span className="shrink-0 text-xs text-slate-400">withdrawn</span>
      ) : lapsed ? (
        // Derived, never stored — a window that passed with nothing in it and no
        // decision to drop it. Surfaced rather than hidden: the past holds what
        // you meant as well as what came of it.
        <span className="shrink-0 text-xs text-amber-600">didn't happen</span>
      ) : null}
      <span className="shrink-0 text-xs text-slate-400">{entryTime(moment)}</span>
    </Link>
  )
})

// --- search results (compact, highlighted) ---------------------------------
const MENTION_TOKEN = /\[@([^\]]+)\]\(\w+:[0-9a-fA-F-]+\)/g
const IMAGE_TOKEN = /!\[[^\]]*\]\(moment-image:[^)]+\)/g

function plain(body: string): string {
  return body.replace(IMAGE_TOKEN, "").replace(MENTION_TOKEN, "@$1").replace(/\s+/g, " ").trim()
}

function snippet(body: string, q: string): string {
  const text = plain(body)
  const i = text.toLowerCase().indexOf(q.toLowerCase())
  if (i < 0) return text.slice(0, 140) + (text.length > 140 ? "…" : "")
  const start = Math.max(0, i - 50)
  const end = Math.min(text.length, i + q.length + 90)
  return (start > 0 ? "…" : "") + text.slice(start, end).trim() + (end < text.length ? "…" : "")
}

function Highlight({ text, q }: { text: string; q: string }) {
  if (!q) return <>{text}</>
  const out: ReactNode[] = []
  const low = text.toLowerCase()
  const ql = q.toLowerCase()
  let i = 0
  let idx = low.indexOf(ql)
  while (idx >= 0) {
    if (idx > i) out.push(text.slice(i, idx))
    out.push(
      <mark key={idx} className="rounded bg-amber-200/70 px-0.5 text-slate-900">
        {text.slice(idx, idx + q.length)}
      </mark>,
    )
    i = idx + q.length
    idx = low.indexOf(ql, i)
  }
  out.push(text.slice(i))
  return <>{out}</>
}

function SearchResultRow({ moment, q, onOpen }: { moment: Moment; q: string; onOpen: () => void }) {
  const when = whenOf(moment)
  return (
    <button
      onClick={onOpen}
      className="block w-full rounded-lg border border-slate-100 bg-surface p-3 text-left hover:bg-slate-50"
    >
      <div className="flex items-baseline justify-between gap-3">
        <span className="break-words font-medium text-slate-800">
          <Highlight text={moment.title || "(untitled)"} q={q} />
        </span>
        {when && <span className="shrink-0 text-xs text-slate-400">{formatDate(when)}</span>}
      </div>
      <p className="mt-0.5 line-clamp-2 text-sm text-slate-600">
        <Highlight text={snippet(moment.body, q)} q={q} />
      </p>
    </button>
  )
}

// --- the log ----------------------------------------------------------------
/** Above this many entries a log stops being a list and starts being an archive:
 *  it earns the year stepper, the month rail, and whole-corpus search. Below it,
 *  navigation for four rows would be furniture. */
const NAVIGABLE_AT = 30

/**
 * A log: every moment involving one subject, newest first, with a composer on top.
 *
 * **The timeline of X is the moments linked to X**, so this one component is a
 * program's history, a person's, a medication's dose record and the Journal —
 * the same query with different arguments, rather than the eight hand-written
 * projections it replaces. Every object has exactly one, in the same place,
 * which is what makes "where do I write this" a navigation question rather than
 * a control you have to choose.
 *
 * The Journal is this scoped by **kind** (`reflection`) rather than by subject:
 * writing turned inward has no subject to be rooted at, and defining the surface
 * by *absence* is what once put a 29-year archive in a triage queue.
 *
 * One component rather than two, scaled by volume. A medication with four
 * entries is a flat list; 253 reflections across 29 years get the archive
 * furniture.
 */
export function Log({
  subject,
  kind,
  heading,
  base,
  deepLink = false,
}: {
  /** Whose timeline this is. Null in the Journal, which is scoped by kind. */
  subject?: { type: EntityType; id: string } | null
  /** Narrow the stream to one act, and write that act. Absent means every kind
   *  involving the subject, and a composer that writes `observation`. */
  kind?: MomentKind
  /** Rendered as the page header. Omit inside a Record, which supplies its own. */
  heading?: string
  base: string
  /** Whether `:id` in the route addresses an entry *in this log*. True only for
   *  the Journal; inside a record the param is the record's own id, and fetching
   *  a moment by it would be a request that can only 404. */
  deepLink?: boolean
}) {
  const params = useParams()
  const id = deepLink ? params.id : undefined
  const navigate = useNavigate()
  // A thing's timeline is what involved it, not what named it: a reflection that
  // happens to mention this program belongs in its backlinks, and putting it in
  // both is the duplication the role vocabulary exists to prevent.
  // Destructured so the memo keys on the two values rather than on an object
  // literal the caller rebuilds every render.
  const subjectType = subject?.type
  const subjectId = subject?.id
  const scope = useMemo<MomentScope>(
    () => ({
      kind,
      linked_type: subjectType,
      linked_id: subjectId,
      role: subjectType ? TIMELINE_ROLES : undefined,
    }),
    [kind, subjectType, subjectId],
  )
  const scoped = !subject || !!subject.id
  // A record's Log is a mixed stream, so each row says what act it is; the
  // Journal is all one kind and the badge would repeat itself 253 times.
  const showKind = !kind

  // One cheap grouped count answers both questions: which years exist, and
  // whether there are enough entries to be worth navigating.
  const { data: calendar } = useMomentsCalendar(scope, scoped)
  const years = useMemo(
    () => [...new Set((calendar ?? []).map((b) => b.year))].sort((a, b) => b - a),
    [calendar],
  )
  const total = useMemo(
    () => (calendar ?? []).reduce((n, b) => n + b.count, 0),
    [calendar],
  )
  const navigable = total >= NAVIGABLE_AT
  const [picked, setPicked] = useState<number | null>(null)
  const [search, setSearch] = useState("")
  const searchQ = search.trim()
  const searching = searchQ.length >= 3
  const partial = searchQ.length > 0 && searchQ.length < 3
  // A deep-linked entry pins the view to its year; otherwise the user's pick,
  // else the most recent year with entries (derived — no effects needed).
  const { data: focused } = moments.useGet(id ?? undefined)
  const focusedWhen = focused ? whenOf(focused) : null
  const permalinkYear = focusedWhen ? Number(focusedWhen.slice(0, 4)) : null
  const year = permalinkYear ?? picked ?? years[0] ?? new Date().getFullYear()

  // Browse: year-scoped (fast first paint). Search (≥3 chars): fetch the whole
  // scoped corpus once and filter on the client so typing is instant.
  const { data, isLoading } = useMomentYear(scope, navigable ? year : null, scoped)
  const corpus = useMomentCorpus(scope, searching && scoped)
  const results = useMemo(() => {
    if (!searching) return [] as Moment[]
    const ql = searchQ.toLowerCase()
    return (corpus.data ?? []).filter((m) =>
      `${m.title ?? ""} ${m.body}`.toLowerCase().includes(ql),
    )
  }, [searching, searchQ, corpus.data])
  const submit = useCreateMomentWithImages()
  const update = moments.useUpdate()
  const remove = moments.useRemove()

  const [editingId, setEditingId] = useState<string | null>(null)
  const focusedRef = useRef<HTMLDivElement>(null)
  const monthRefs = useRef<Record<number, HTMLDivElement | null>>({})

  // Stable handlers so memoized rows don't re-render on every keystroke/refetch.
  const removeMutate = remove.mutate
  const handleEdit = useCallback((momentId: string) => setEditingId(momentId), [])
  const handleDelete = useCallback(
    (momentId: string) => {
      if (confirm("Delete this entry?")) {
        removeMutate(momentId)
        if (momentId === id) navigate(base)
      }
    },
    [removeMutate, id, navigate, base],
  )
  // Merge in a permalinked entry from another stream so its link never dead-ends
  // — `/moments/:id` addresses any moment, not just this log's.
  const rows = useMemo(() => {
    const list = data ?? []
    return focused && !list.some((m) => m.id === focused.id) ? [focused, ...list] : list
  }, [data, focused])

  // Filter by the act, which is the one facet a mixed timeline has that a list
  // of notes did not. Options reflect what is actually present this year, and
  // the filter is absent in a single-kind stream where it could only say one
  // thing.
  const config = useMemo<ListConfig>(() => {
    const kinds = Array.from(new Set(rows.map((m) => m.kind))).sort()
    const filters: FilterDef[] = []
    if (kinds.length > 1)
      filters.push({
        field: "kind",
        label: "Kind",
        options: kinds,
        optionLabels: Object.fromEntries(kinds.map((k) => [k, KIND_LABEL[k]])),
      })
    return { searchKeys: ["title", "body"], filters, sorts: [{ key: "default", label: "Newest", field: "" }] }
  }, [rows])

  const { filtered, toolbarProps } = useListFilter(
    rows as unknown as Record<string, unknown>[],
    config,
    `log:${kind ?? subject?.type ?? "all"}`,
  )
  // A permalinked entry is the thing you asked for by id, so no filter may hide it.
  const list = useMemo(() => {
    const rowsOut = filtered as unknown as Moment[]
    return focused && !rowsOut.some((m) => m.id === focused.id) ? [focused, ...rowsOut] : rowsOut
  }, [filtered, focused])
  const groups = useMemo(() => groupMomentsByDay(list), [list])
  // From what the stream actually shows, not from the calendar: a month button
  // whose rows were filtered away scrolls nowhere.
  const monthsPresent = useMemo(
    () => new Set(groups.map((g) => Number(g.key.slice(5, 7)))),
    [groups],
  )

  useEffect(() => {
    if (id) focusedRef.current?.scrollIntoView({ block: "center", behavior: "smooth" })
  }, [id, list.length])

  const idx = years.indexOf(year)
  const yearOptions = years.includes(year) ? years : [year, ...years].sort((a, b) => b - a)
  const seenMonths = new Set<number>()

  return (
    <div className="space-y-4">
      <div className="flex items-end justify-between gap-3">
        <div>
          {heading && <h1 className="text-lg font-semibold text-slate-900">{heading}</h1>}
          <p className="text-sm text-slate-500">
            {searching
              ? `${results.length} result${results.length === 1 ? "" : "s"}`
              : navigable
                ? `${list.length} in ${year}`
                : `${list.length} ${list.length === 1 ? "entry" : "entries"}`}
          </p>
        </div>
        {navigable && !searching && (
        <div className="flex items-center gap-1">
          <button
            className="rounded p-1 text-slate-400 hover:bg-slate-100 disabled:opacity-30"
            title="Older year"
            disabled={idx < 0 || idx >= years.length - 1}
            onClick={() => setPicked(years[idx + 1])}
          >
            <ChevronLeft size={18} />
          </button>
          <select
            className="rounded-lg border border-slate-300 bg-surface px-2 py-1 text-sm"
            value={year}
            onChange={(e) => setPicked(Number(e.target.value))}
          >
            {yearOptions.map((y) => (
              <option key={y} value={y}>
                {y}
              </option>
            ))}
          </select>
          <button
            className="rounded p-1 text-slate-400 hover:bg-slate-100 disabled:opacity-30"
            title="Newer year"
            disabled={idx <= 0}
            onClick={() => setPicked(years[idx - 1])}
          >
            <ChevronRight size={18} />
          </button>
        </div>
        )}
      </div>

      <Card className="p-3">
        {/* The kind is the surface's to declare: a log writes an observation
            about its subject, the Journal writes a reflection. Never asked. */}
        <MomentComposer
          mode="create"
          autoFocus
          kind={kind ?? "observation"}
          defaultSubject={subject ?? null}
          onSubmit={(b, pending) =>
            submit(b, pending).then(() => setPicked(new Date().getFullYear()))
          }
        />
      </Card>

      {/* month rail */}
      {navigable && !searching && (
        <div className="flex flex-wrap gap-0.5">
          {MONTHS.map((label, i) => {
          const m = i + 1
          const present = monthsPresent.has(m)
          return (
            <button
              key={m}
              disabled={!present}
              className={`rounded px-2 py-0.5 text-xs ${present ? "text-indigo-600 hover:bg-indigo-50" : "text-slate-300"}`}
              onClick={() =>
                monthRefs.current[m]?.scrollIntoView({ block: "start", behavior: "smooth" })
              }
            >
              {label}
            </button>
          )
          })}
        </div>
      )}

      <ListToolbar {...toolbarProps} search={search} onSearch={setSearch} />

      {partial ? (
        <EmptyState>Type 3+ characters to search…</EmptyState>
      ) : searching ? (
        corpus.isFetching && !corpus.data ? (
          <EmptyState>Searching…</EmptyState>
        ) : results.length === 0 ? (
          <EmptyState>No matches.</EmptyState>
        ) : (
          <div className="space-y-1.5">
            {results.map((m) => (
              <SearchResultRow
                key={m.id}
                moment={m}
                q={searchQ}
                onOpen={() => {
                  setSearch("")
                  navigate(`${base}/${m.id}`)
                }}
              />
            ))}
          </div>
        )
      ) : isLoading ? (
        <EmptyState>Loading…</EmptyState>
      ) : list.length === 0 ? (
        <EmptyState>{navigable ? `Nothing in ${year}.` : "Nothing recorded yet."}</EmptyState>
      ) : (
        <div className="space-y-5">
          {groups.map((g) => {
            const m = Number(g.key.slice(5, 7))
            const firstOfMonth = !seenMonths.has(m)
            if (firstOfMonth) seenMonths.add(m)
            return (
              <div
                key={g.key}
                className="space-y-2"
                ref={
                  firstOfMonth
                    ? (el) => {
                        monthRefs.current[m] = el
                      }
                    : undefined
                }
              >
                <div className="sticky top-0 z-10 bg-slate-50/90 py-1 text-xs font-semibold uppercase tracking-wide text-slate-400 backdrop-blur">
                  {g.label}
                </div>
                {g.moments.map((n) => (
                  <div key={n.id} ref={n.id === id ? focusedRef : undefined}>
                    {editingId === n.id ? (
                      <Card className="p-3">
                        <MomentComposer
                          mode="edit"
                          kind={n.kind}
                          initial={n}
                          onSubmit={(b: Body) => {
                            update.mutate({ id: n.id, body: b })
                            setEditingId(null)
                          }}
                          onCancel={() => setEditingId(null)}
                        />
                      </Card>
                    ) : isProse(n.kind) ? (
                      <ProseEntry
                        moment={n}
                        focused={n.id === id}
                        base={base}
                        showKind={showKind}
                        onEdit={handleEdit}
                        onDelete={handleDelete}
                      />
                    ) : (
                      <RecordedRow moment={n} />
                    )}
                  </div>
                ))}
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}
