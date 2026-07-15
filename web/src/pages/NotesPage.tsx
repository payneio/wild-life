import { useEffect, useMemo, useRef, useState } from "react"
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
import { notes, useCreateNoteWithImages, useNotesCalendar } from "@/services/api/hooks"
import { useEntityResolver } from "@/services/api/mentions"
import type { Note } from "@/services/api/types"
import { groupNotesByDay } from "@/lib/format"

const NOTE_TYPES = ["note", "journal", "idea", "meeting", "reference"] as const

// Notes carrying this tag are the imported Microsoft work stream; the Journal
// (personal) and Work Journal pages are the same component scoped by its presence.
const WORK_TAG = "work:microsoft"

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
function JournalEntry({
  note,
  focused,
  base,
  onEdit,
  onDelete,
}: {
  note: Note
  focused: boolean
  base: string
  onEdit: () => void
  onDelete: () => void
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
        <div className="flex gap-0.5 opacity-0 transition group-hover:opacity-100">
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
            onClick={onEdit}
          >
            <Pencil size={14} />
          </button>
          <button
            className="rounded p-1 text-slate-400 hover:bg-red-50 hover:text-red-600"
            title="Delete"
            onClick={onDelete}
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
}

// --- page -------------------------------------------------------------------
export function NotesPage({ scope = "personal" }: { scope?: "personal" | "work" }) {
  const { id } = useParams()
  const navigate = useNavigate()
  const scopeParam = scope === "work" ? { tag: WORK_TAG } : { no_tag: WORK_TAG }

  const { data: calendar } = useNotesCalendar(scopeParam)
  const years = useMemo(
    () => [...new Set((calendar ?? []).map((b) => b.year))].sort((a, b) => b - a),
    [calendar],
  )
  const [picked, setPicked] = useState<number | null>(null)
  const [search, setSearch] = useState("")
  const searchQ = search.trim()
  const searching = searchQ.length > 0
  // A deep-linked note pins the view to its year; otherwise the user's pick,
  // else the most recent year with entries (derived — no effects needed).
  const { data: focusedNote } = notes.useGet(id ?? undefined)
  const permalinkYear = focusedNote?.entry_date
    ? Number(focusedNote.entry_date.slice(0, 4))
    : null
  const year = permalinkYear ?? picked ?? years[0] ?? new Date().getFullYear()

  // Search hits the server across ALL years; browse is year-scoped. Both server-side.
  const { data, isLoading } = notes.useList(
    searching ? { q: searchQ, ...scopeParam } : { year: String(year), ...scopeParam },
  )
  const submitNote = useCreateNoteWithImages()
  const update = notes.useUpdate()
  const remove = notes.useRemove()

  const [editingId, setEditingId] = useState<string | null>(null)
  const focusedRef = useRef<HTMLDivElement>(null)
  const monthRefs = useRef<Record<number, HTMLDivElement | null>>({})

  const base = scope === "work" ? "/work-journal" : "/notes"
  // Merge in a cross-scope permalinked note so its link never dead-ends.
  const rows = useMemo(() => {
    const list = data ?? []
    if (focusedNote && !list.some((n) => n.id === focusedNote.id)) return [focusedNote, ...list]
    return list
  }, [data, focusedNote])
  const { filtered, toolbarProps } = useListFilter(
    rows as unknown as Record<string, unknown>[],
    NOTE_CONFIG,
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
    <div className="mx-auto max-w-2xl space-y-4">
      <div className="flex items-end justify-between gap-3">
        <div>
          <h1 className="text-lg font-semibold text-slate-900">
            {scope === "work" ? "Work Journal" : "Journal"}
          </h1>
          <p className="text-sm text-slate-500">
            {searching
              ? `${notesList.length} result${notesList.length === 1 ? "" : "s"}`
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
            className="rounded-lg border border-slate-300 bg-white px-2 py-1 text-sm"
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
              scope === "work"
                ? {
                    ...b,
                    tags: Array.from(
                      new Set([...((b.tags as string[] | undefined) ?? []), WORK_TAG]),
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

      {isLoading ? (
        <EmptyState>Loading…</EmptyState>
      ) : notesList.length === 0 ? (
        <EmptyState>{searching ? "No matches." : `No entries in ${year}.`}</EmptyState>
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
                        onEdit={() => setEditingId(n.id)}
                        onDelete={() => {
                          if (confirm("Delete this entry?")) {
                            remove.mutate(n.id)
                            if (n.id === id) navigate(base)
                          }
                        }}
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
