import { useEffect, useMemo, useRef, useState } from "react"
import { useNavigate, useParams } from "react-router-dom"
import { Link2, Pencil, Trash2 } from "lucide-react"
import { Backlinks } from "@/components/Backlinks"
import { ListToolbar } from "@/components/ListToolbar"
import { MentionChip } from "@/components/MentionChip"
import { MentionText } from "@/components/MentionText"
import { NoteComposer } from "@/components/NoteComposer"
import { Badge, Card, EmptyState } from "@/components/ui/primitives"
import { useListFilter, type ListConfig } from "@/lib/listFilter"
import type { Body } from "@/services/api/crud"
import { notes, useCreateNoteWithImages } from "@/services/api/hooks"
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
  const { data, isLoading } = notes.useList()
  const submitNote = useCreateNoteWithImages()
  const update = notes.useUpdate()
  const remove = notes.useRemove()

  const [editingId, setEditingId] = useState<string | null>(null)
  const focusedRef = useRef<HTMLDivElement>(null)

  const base = scope === "work" ? "/work-journal" : "/notes"
  const rows = useMemo(() => data ?? [], [data])
  // Scope the stream by the work tag; a permalinked note is always kept visible
  // even if it belongs to the other scope, so cross-scope links never dead-end.
  const scoped = useMemo(
    () =>
      rows.filter((n) => {
        if (n.id === id) return true
        const isWork = (n.tags ?? []).includes(WORK_TAG)
        return scope === "work" ? isWork : !isWork
      }),
    [rows, scope, id],
  )
  const { filtered, toolbarProps } = useListFilter(
    scoped as unknown as Record<string, unknown>[],
    NOTE_CONFIG,
  )
  const notesList = filtered as unknown as Note[]
  const groups = useMemo(() => groupNotesByDay(notesList), [notesList])

  // Scroll the deep-linked / permalinked entry into view.
  useEffect(() => {
    if (id) focusedRef.current?.scrollIntoView({ block: "center", behavior: "smooth" })
  }, [id, notesList.length])

  return (
    <div className="mx-auto max-w-2xl space-y-4">
      <div>
        <h1 className="text-lg font-semibold text-slate-900">
          {scope === "work" ? "Work Journal" : "Journal"}
        </h1>
        <p className="text-sm text-slate-500">{scoped.length} entries</p>
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
            )
          }
        />
      </Card>

      <ListToolbar {...toolbarProps} />

      {isLoading ? (
        <EmptyState>Loading…</EmptyState>
      ) : notesList.length === 0 ? (
        <EmptyState>No entries yet — write your first above.</EmptyState>
      ) : (
        <div className="space-y-5">
          {groups.map((g) => (
            <div key={g.key} className="space-y-2">
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
          ))}
        </div>
      )}
    </div>
  )
}
