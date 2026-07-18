import { memo, useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from "react"
import { useNavigate, useParams } from "react-router-dom"
import { ChevronLeft, ChevronRight, Link2, Pencil, Trash2 } from "lucide-react"
import { Backlinks } from "@/components/Backlinks"
import { ListToolbar } from "@/components/ListToolbar"
import { MentionChip } from "@/components/MentionChip"
import { MentionText } from "@/components/MentionText"
import { NoteComposer } from "@/components/NoteComposer"
import { Badge, Card, EmptyState } from "@/components/ui/primitives"
import { useListFilter, type ListConfig } from "@/lib/listFilter"
import type { Body } from "@/services/api/crud"
import { notes, useCreateNoteWithImages, useNoteCorpus, useNotesCalendar } from "@/services/api/hooks"
import { cn, formatDate } from "@/lib/utils"
import { useEntityResolver } from "@/services/api/mentions"
import type { Note } from "@/services/api/types"
import { groupNotesByDay } from "@/lib/format"

const NOTE_TYPES = ["note", "journal", "idea", "meeting", "reference"] as const

// Notes carrying this tag are the imported Microsoft work stream; the Journal
// (personal) and Work Journal pages are the same component scoped by its presence.
const WORK_TAG = "work:microsoft"

// The Whiteboard is a third notes scope: notes carrying this tag. The personal
// Journal excludes both this and the work tag so leftovers don't leak into it.
const WHITEBOARD_TAG = "whiteboard"

const NOTE_CONFIG: ListConfig = {
  searchKeys: ["title", "body"],
  filters: [{ field: "note_type", label: "Type", options: NOTE_TYPES }],
  sorts: [{ key: "default", label: "Newest", field: "" }],
}

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"]

function entryTime(note: Note): string {
  const d = new Date(note.created_at)
  if (Number.isNaN(d.getTime())) return ""
  return d.toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" })
}

// --- one entry in the stream ------------------------------------------------
// Memoized with stable id-taking callbacks so that when one note updates
// (e.g. an optimistic edit), only that note re-renders — the other ~130 entries
// keep their props and skip the (expensive, markdown-heavy) render entirely.
const JournalEntry = memo(function JournalEntry({
  note,
  focused,
  base,
  onEdit,
  onDelete,
}: {
  note: Note
  focused: boolean
  base: string
  onEdit: (id: string) => void
  onDelete: (id: string) => void
}) {
  const resolve = useEntityResolver()
  const navigate = useNavigate()
  return (
    <Card
      className={`group space-y-2 p-4 transition ${
        focused ? "ring-2 ring-indigo-300" : ""
      }`}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="flex flex-wrap items-center gap-2 text-xs text-slate-400">
          <span>{entryTime(note)}</span>
          {note.note_type !== "journal" && <Badge>{note.note_type}</Badge>}
          {note.mood && <span>· {note.mood}</span>}
        </div>
        {/* Reveal on hover for pointer devices; always visible on touch (no
            hover) — otherwise notes can't be edited/deleted on mobile. */}
        <div className="flex gap-0.5 opacity-100 transition [@media(hover:hover)]:opacity-0 [@media(hover:hover)]:group-hover:opacity-100">
          <button
            className="rounded p-1 text-slate-400 hover:bg-slate-100 hover:text-slate-700"
            title="Permalink"
            onClick={() => navigate(`${base}/${note.id}`)}
          >
            <Link2 size={14} />
          </button>
          <button
            className="rounded p-1 text-slate-400 hover:bg-slate-100 hover:text-slate-700"
            title="Edit"
            onClick={() => onEdit(note.id)}
          >
            <Pencil size={14} />
          </button>
          <button
            className="rounded p-1 text-slate-400 hover:bg-red-50 hover:text-red-600"
            title="Delete"
            onClick={() => onDelete(note.id)}
          >
            <Trash2 size={14} />
          </button>
        </div>
      </div>

      {note.title && <h3 className="text-sm font-semibold text-slate-900">{note.title}</h3>}

      <MentionText>{note.body || "_Empty note._"}</MentionText>

      {(note.tags.length > 0 || note.links.length > 0) && (
        <div className="flex flex-wrap items-center gap-1.5 pt-0.5">
          {note.links.map((l) => (
            <MentionChip
              key={`${l.target_type}:${l.target_id}`}
              type={l.target_type}
              id={l.target_id}
              label={resolve(l.target_type, l.target_id) ?? l.target_type}
            />
          ))}
          {note.tags.map((t) => (
            <Badge key={t}>{t}</Badge>
          ))}
        </div>
      )}

      {focused && <Backlinks type="note" id={note.id} />}
    </Card>
  )
})

// --- search results (compact, highlighted) ---------------------------------
const MENTION_TOKEN = /\[@([^\]]+)\]\(\w+:[0-9a-fA-F-]+\)/g
const IMAGE_TOKEN = /!\[[^\]]*\]\(note-image:[^)]+\)/g

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

function SearchResultRow({ note, q, onOpen }: { note: Note; q: string; onOpen: () => void }) {
  return (
    <button
      onClick={onOpen}
      className="block w-full rounded-lg border border-slate-100 bg-surface p-3 text-left hover:bg-slate-50"
    >
      <div className="flex items-baseline justify-between gap-3">
        <span className="break-words font-medium text-slate-800">
          <Highlight text={note.title || "(untitled)"} q={q} />
        </span>
        {note.entry_date && (
          <span className="shrink-0 text-xs text-slate-400">{formatDate(note.entry_date)}</span>
        )}
      </div>
      <p className="mt-0.5 line-clamp-2 text-sm text-slate-600">
        <Highlight text={snippet(note.body, q)} q={q} />
      </p>
    </button>
  )
}

// --- page -------------------------------------------------------------------
export function NotesPage({
  scope = "personal",
}: {
  scope?: "personal" | "work" | "whiteboard"
}) {
  const { id } = useParams()
  const navigate = useNavigate()
  const scopeParam =
    scope === "work"
      ? { tag: WORK_TAG }
      : scope === "whiteboard"
        ? { tag: WHITEBOARD_TAG }
        : { no_tag: [WORK_TAG, WHITEBOARD_TAG] }
  // Tag stamped onto notes composed in a tagged scope (personal adds nothing).
  const scopeTag = scope === "work" ? WORK_TAG : scope === "whiteboard" ? WHITEBOARD_TAG : null

  const { data: calendar } = useNotesCalendar(scopeParam)
  const years = useMemo(
    () => [...new Set((calendar ?? []).map((b) => b.year))].sort((a, b) => b - a),
    [calendar],
  )
  const [picked, setPicked] = useState<number | null>(null)
  const [search, setSearch] = useState("")
  const searchQ = search.trim()
  const searching = searchQ.length >= 3
  const partial = searchQ.length > 0 && searchQ.length < 3
  // A deep-linked note pins the view to its year; otherwise the user's pick,
  // else the most recent year with entries (derived — no effects needed).
  const { data: focusedNote } = notes.useGet(id ?? undefined)
  const permalinkYear = focusedNote?.entry_date
    ? Number(focusedNote.entry_date.slice(0, 4))
    : null
  const year = permalinkYear ?? picked ?? years[0] ?? new Date().getFullYear()

  // Browse: year-scoped (fast first paint). Search (≥3 chars): fetch the whole scoped
  // corpus once and filter on the client so typing is instant.
  const { data, isLoading } = notes.useList({ year: String(year), ...scopeParam })
  const corpus = useNoteCorpus(scopeParam, searching)
  const results = useMemo(() => {
    if (!searching) return [] as Note[]
    const ql = searchQ.toLowerCase()
    return (corpus.data ?? []).filter((n) =>
      `${n.title ?? ""} ${n.body}`.toLowerCase().includes(ql),
    )
  }, [searching, searchQ, corpus.data])
  const submitNote = useCreateNoteWithImages()
  const update = notes.useUpdate()
  const remove = notes.useRemove()

  const [editingId, setEditingId] = useState<string | null>(null)
  const focusedRef = useRef<HTMLDivElement>(null)
  const monthRefs = useRef<Record<number, HTMLDivElement | null>>({})

  const base =
    scope === "work" ? "/work-journal" : scope === "whiteboard" ? "/whiteboard" : "/notes"
  const heading = scope === "work" ? "Work Journal" : scope === "whiteboard" ? "Whiteboard" : "Journal"
  // Stable handlers so memoized JournalEntry rows don't re-render on every keystroke/refetch.
  const removeMutate = remove.mutate
  const handleEdit = useCallback((noteId: string) => setEditingId(noteId), [])
  const handleDelete = useCallback(
    (noteId: string) => {
      if (confirm("Delete this entry?")) {
        removeMutate(noteId)
        if (noteId === id) navigate(base)
      }
    },
    [removeMutate, id, navigate, base],
  )
  // Merge in a cross-scope permalinked note so its link never dead-ends.
  const rows = useMemo(() => {
    const list = data ?? []
    if (focusedNote && !list.some((n) => n.id === focusedNote.id)) return [focusedNote, ...list]
    return list
  }, [data, focusedNote])
  const { filtered, toolbarProps } = useListFilter(
    rows as unknown as Record<string, unknown>[],
    NOTE_CONFIG,
    `notes:${scope}`,
  )
  const notesList = filtered as unknown as Note[]
  const groups = useMemo(() => groupNotesByDay(notesList), [notesList])
  const monthsPresent = useMemo(
    () => new Set((calendar ?? []).filter((b) => b.year === year).map((b) => b.month)),
    [calendar, year],
  )

  useEffect(() => {
    if (id) focusedRef.current?.scrollIntoView({ block: "center", behavior: "smooth" })
  }, [id, notesList.length])

  const idx = years.indexOf(year)
  const yearOptions = years.includes(year) ? years : [year, ...years].sort((a, b) => b - a)
  const seenMonths = new Set<number>()

  return (
    <div
      className={cn(
        "space-y-4",
        // Whiteboard is a canvas — let it use the whole width. The journals stay a
        // comfortable reading column, just a wider one than before.
        scope === "whiteboard" ? "w-full" : "mx-auto max-w-4xl",
      )}
    >
      <div className="flex items-end justify-between gap-3">
        <div>
          <h1 className="text-lg font-semibold text-slate-900">{heading}</h1>
          <p className="text-sm text-slate-500">
            {searching
              ? `${results.length} result${results.length === 1 ? "" : "s"}`
              : `${(data ?? []).length} in ${year}`}
          </p>
        </div>
        {!searching && (
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
        <NoteComposer
          mode="create"
          autoFocus
          onSubmit={(b, pending) =>
            submitNote(
              scopeTag
                ? {
                    ...b,
                    tags: Array.from(
                      new Set([...((b.tags as string[] | undefined) ?? []), scopeTag]),
                    ),
                  }
                : b,
              pending,
            ).then(() => setPicked(new Date().getFullYear()))
          }
        />
      </Card>

      {/* month rail */}
      {!searching && (
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
            {results.map((n) => (
              <SearchResultRow
                key={n.id}
                note={n}
                q={searchQ}
                onOpen={() => {
                  setSearch("")
                  navigate(`${base}/${n.id}`)
                }}
              />
            ))}
          </div>
        )
      ) : isLoading ? (
        <EmptyState>Loading…</EmptyState>
      ) : notesList.length === 0 ? (
        <EmptyState>{`No entries in ${year}.`}</EmptyState>
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
                {g.notes.map((n) => (
                  <div key={n.id} ref={n.id === id ? focusedRef : undefined}>
                    {editingId === n.id ? (
                      <Card className="p-3">
                        <NoteComposer
                          mode="edit"
                          initial={n}
                          onSubmit={(b: Body) => {
                            update.mutate({ id: n.id, body: b })
                            setEditingId(null)
                          }}
                          onCancel={() => setEditingId(null)}
                        />
                      </Card>
                    ) : (
                      <JournalEntry
                        note={n}
                        focused={n.id === id}
                        base={base}
                        onEdit={handleEdit}
                        onDelete={handleDelete}
                      />
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
