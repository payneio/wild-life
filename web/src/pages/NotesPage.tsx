import { useMemo, useRef, useState } from "react"
import { useNavigate, useParams } from "react-router-dom"
import { Eye, Pencil, Plus, PencilLine, Trash2, X } from "lucide-react"
import { Backlinks } from "@/components/Backlinks"
import { EntityCombobox } from "@/components/EntityCombobox"
import { MentionChip } from "@/components/MentionChip"
import { MentionText } from "@/components/MentionText"
import {
  Badge,
  Button,
  Card,
  EmptyState,
  Field,
  Input,
  Modal,
  Select,
} from "@/components/ui/primitives"

const TEXTAREA_CLS =
  "w-full rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-sm outline-none focus:border-indigo-500 focus:ring-2 focus:ring-indigo-100"
import { formatDate } from "@/lib/utils"
import type { Body } from "@/services/api/crud"
import { notes } from "@/services/api/hooks"
import {
  mentionToken,
  mergeLinks,
  useEntityResolver,
  type MentionResult,
} from "@/services/api/mentions"
import type { Note } from "@/services/api/types"

const NOTE_TYPES = ["note", "journal", "idea", "meeting", "reference"] as const

function todayISO(): string {
  const d = new Date()
  const p = (n: number) => String(n).padStart(2, "0")
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`
}

// --- editor -----------------------------------------------------------------
function NoteEditor({
  initial,
  onSubmit,
  onCancel,
}: {
  initial?: Note | null
  onSubmit: (body: Body) => void
  onCancel: () => void
}) {
  const resolve = useEntityResolver()
  const [title, setTitle] = useState(initial?.title ?? "")
  const [noteType, setNoteType] = useState(initial?.note_type ?? "journal")
  const [entryDate, setEntryDate] = useState(initial?.entry_date ?? todayISO())
  const [mood, setMood] = useState(initial?.mood ?? "")
  const [tags, setTags] = useState((initial?.tags ?? []).join(", "))
  const [body, setBody] = useState(initial?.body ?? "")
  const [preview, setPreview] = useState(false)
  const taRef = useRef<HTMLTextAreaElement>(null)

  // Manual chips = links not written inline in the body.
  const [manual, setManual] = useState<MentionResult[]>(() => {
    const inlineKeys = new Set(mergeLinks(initial?.body ?? "", []).map((r) => `${r.type}:${r.id}`))
    return (initial?.links ?? [])
      .filter((l) => !inlineKeys.has(`${l.target_type}:${l.target_id}`))
      .map((l) => ({
        type: l.target_type,
        id: l.target_id,
        label: resolve(l.target_type, l.target_id) ?? "…",
      }))
  })

  // @-mention popover anchored in the body.
  const [mentionAt, setMentionAt] = useState<number | null>(null)
  const [chipPicker, setChipPicker] = useState(false)

  const links = useMemo(() => mergeLinks(body, manual), [body, manual])

  function onBodyChange(e: React.ChangeEvent<HTMLTextAreaElement>) {
    const val = e.target.value
    const caret = e.target.selectionStart
    setBody(val)
    // opened only when the just-typed char is a boundary "@"
    if (/(^|\s)@$/.test(val.slice(0, caret))) setMentionAt(caret - 1)
    else setMentionAt(null)
  }

  function insertMention(r: MentionResult) {
    if (mentionAt == null) return
    setBody((b) => `${b.slice(0, mentionAt)}${mentionToken(r)} ${b.slice(mentionAt + 1)}`)
    setMentionAt(null)
    setTimeout(() => taRef.current?.focus(), 0)
  }

  function removeLink(r: MentionResult) {
    setBody((b) => b.replace(mentionToken(r), "").replace(/[ \t]{2,}/g, " "))
    setManual((m) => m.filter((x) => !(x.type === r.type && x.id === r.id)))
  }

  function labelFor(r: MentionResult): string {
    return r.label && r.label !== "…" ? r.label : (resolve(r.type, r.id) ?? r.label)
  }

  function submit() {
    onSubmit({
      title: title || null,
      note_type: noteType,
      entry_date: entryDate || null,
      mood: mood || null,
      tags: tags.split(",").map((t) => t.trim()).filter(Boolean),
      body,
      links: mergeLinks(body, manual).map((r) => ({
        target_type: r.type,
        target_id: r.id,
      })),
    })
  }

  return (
    <div className="space-y-3">
      <div className="grid grid-cols-2 gap-3">
        <Field label="Title" className="col-span-2">
          <Input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Optional title" />
        </Field>
        <Field label="Type">
          <Select value={noteType} onChange={(e) => setNoteType(e.target.value)}>
            {NOTE_TYPES.map((t) => (
              <option key={t} value={t}>{t}</option>
            ))}
          </Select>
        </Field>
        <Field label="Date">
          <Input type="date" value={entryDate} onChange={(e) => setEntryDate(e.target.value)} />
        </Field>
        <Field label="Mood">
          <Input value={mood} onChange={(e) => setMood(e.target.value)} />
        </Field>
        <Field label="Tags">
          <Input value={tags} placeholder="comma, separated" onChange={(e) => setTags(e.target.value)} />
        </Field>
      </div>

      <div>
        <div className="mb-1 flex items-center justify-between">
          <span className="text-sm font-medium text-slate-600">Body</span>
          <button
            type="button"
            className="flex items-center gap-1 text-xs text-indigo-600 hover:text-indigo-800"
            onClick={() => setPreview((p) => !p)}
          >
            {preview ? <PencilLine size={13} /> : <Eye size={13} />}
            {preview ? "Edit" : "Preview"}
          </button>
        </div>
        {preview ? (
          <div className="min-h-32 rounded-lg border border-slate-200 p-3">
            <MentionText>{body || "_Nothing yet._"}</MentionText>
          </div>
        ) : (
          <div className="relative">
            <textarea
              ref={taRef}
              className={`${TEXTAREA_CLS} min-h-40 font-mono text-[13px]`}
              value={body}
              placeholder="Write in markdown. Type @ to mention a person, place, project…"
              onChange={onBodyChange}
            />
            {mentionAt != null && (
              <div className="absolute left-2 top-full z-20 mt-1">
                <EntityCombobox onSelect={insertMention} onClose={() => setMentionAt(null)} />
              </div>
            )}
          </div>
        )}
      </div>

      <div>
        <div className="mb-1 flex items-center justify-between">
          <span className="text-sm font-medium text-slate-600">Linked</span>
          <button
            type="button"
            className="flex items-center gap-1 text-xs text-indigo-600 hover:text-indigo-800"
            onClick={() => setChipPicker((v) => !v)}
          >
            <Plus size={13} /> link
          </button>
        </div>
        {links.length === 0 && !chipPicker && (
          <p className="text-xs text-slate-400">No links yet. Type @ in the body or click “link”.</p>
        )}
        <div className="flex flex-wrap items-center gap-1.5">
          {links.map((r) => (
            <span
              key={`${r.type}:${r.id}`}
              className="flex items-center gap-1 rounded bg-indigo-50 px-1.5 py-0.5 text-xs text-indigo-700"
            >
              @{labelFor(r)}
              <button type="button" className="text-indigo-400 hover:text-red-600" onClick={() => removeLink(r)}>
                <X size={11} />
              </button>
            </span>
          ))}
        </div>
        {chipPicker && (
          <div className="mt-1.5">
            <EntityCombobox
              onSelect={(r) => {
                setManual((m) =>
                  m.some((x) => x.type === r.type && x.id === r.id) ? m : [...m, r],
                )
                setChipPicker(false)
              }}
              onClose={() => setChipPicker(false)}
            />
          </div>
        )}
      </div>

      <div className="flex justify-end gap-2 pt-1">
        <Button variant="secondary" onClick={onCancel}>Cancel</Button>
        <Button onClick={submit}>Save</Button>
      </div>
    </div>
  )
}

// --- detail -----------------------------------------------------------------
function NoteDetail({ note, onEdit, onDelete }: { note: Note; onEdit: () => void; onDelete: () => void }) {
  const resolve = useEntityResolver()
  return (
    <Card className="space-y-4 p-5">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h2 className="text-lg font-semibold text-slate-900">{note.title || "(untitled)"}</h2>
          <div className="mt-0.5 flex flex-wrap items-center gap-2 text-xs text-slate-400">
            <Badge>{note.note_type}</Badge>
            {note.entry_date && <span>{formatDate(note.entry_date)}</span>}
            {note.mood && <span>· {note.mood}</span>}
          </div>
        </div>
        <div className="flex gap-1">
          <Button variant="secondary" onClick={onEdit}>
            <Pencil size={14} /> Edit
          </Button>
          <Button variant="danger" onClick={onDelete}>
            <Trash2 size={14} />
          </Button>
        </div>
      </div>

      <MentionText>{note.body || "_Empty note._"}</MentionText>

      {note.tags.length > 0 && (
        <div className="flex flex-wrap gap-1">
          {note.tags.map((t) => (
            <Badge key={t}>{t}</Badge>
          ))}
        </div>
      )}

      {note.links.length > 0 && (
        <div>
          <h3 className="mb-1.5 text-xs font-medium uppercase tracking-wide text-slate-400">Linked</h3>
          <div className="flex flex-wrap gap-1.5">
            {note.links.map((l) => (
              <MentionChip
                key={`${l.target_type}:${l.target_id}`}
                type={l.target_type}
                id={l.target_id}
                label={resolve(l.target_type, l.target_id) ?? l.target_type}
              />
            ))}
          </div>
        </div>
      )}

      <Backlinks type="note" id={note.id} />
    </Card>
  )
}

// --- page -------------------------------------------------------------------
export function NotesPage() {
  const { id } = useParams()
  const navigate = useNavigate()
  const { data, isLoading } = notes.useList()
  const create = notes.useCreate()
  const update = notes.useUpdate()
  const remove = notes.useRemove()

  const [search, setSearch] = useState("")
  const [typeFilter, setTypeFilter] = useState("")
  const [creating, setCreating] = useState(false)
  const [editing, setEditing] = useState<Note | null>(null)

  const rows = useMemo(() => data ?? [], [data])
  const selected = rows.find((n) => n.id === id) ?? null

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase()
    return rows.filter((n) => {
      if (typeFilter && n.note_type !== typeFilter) return false
      if (!q) return true
      return `${n.title ?? ""} ${n.body}`.toLowerCase().includes(q)
    })
  }, [rows, search, typeFilter])

  function submit(bodyPayload: Body) {
    if (editing) {
      update.mutate({ id: editing.id, body: bodyPayload })
      setEditing(null)
    } else {
      create.mutate(bodyPayload, { onSuccess: (n) => navigate(`/notes/${(n as Note).id}`) })
      setCreating(false)
    }
  }

  return (
    <div className="space-y-3">
      <div className="flex items-end justify-between">
        <div>
          <h1 className="text-lg font-semibold text-slate-900">Notes</h1>
          <p className="text-sm text-slate-500">{rows.length} journal entries, ideas, and meeting notes</p>
        </div>
        <Button onClick={() => setCreating(true)}>
          <Plus size={16} /> New note
        </Button>
      </div>

      <div className="flex flex-col gap-4 lg:flex-row">
        <div className="lg:w-80 lg:shrink-0">
          <div className="space-y-2">
            <Input placeholder="Search notes…" value={search} onChange={(e) => setSearch(e.target.value)} />
            <Select className="text-xs" value={typeFilter} onChange={(e) => setTypeFilter(e.target.value)}>
              <option value="">All types</option>
              {NOTE_TYPES.map((t) => (
                <option key={t} value={t}>{t}</option>
              ))}
            </Select>
          </div>
          <Card className="mt-2 max-h-[70vh] overflow-y-auto">
            {isLoading ? (
              <div className="p-4 text-sm text-slate-400">Loading…</div>
            ) : filtered.length === 0 ? (
              <div className="p-4 text-sm text-slate-400">No matches.</div>
            ) : (
              <ul>
                {filtered.map((n) => (
                  <li key={n.id}>
                    <button
                      className={`block w-full border-b border-slate-50 px-3 py-2 text-left last:border-0 hover:bg-slate-50 ${
                        n.id === id ? "bg-indigo-50" : ""
                      }`}
                      onClick={() => navigate(`/notes/${n.id}`)}
                    >
                      <span className="block truncate text-sm font-medium text-slate-800">
                        {n.title || "(untitled)"}
                      </span>
                      <span className="block truncate text-xs text-slate-400">
                        {n.entry_date ? `${formatDate(n.entry_date)} · ` : ""}
                        {n.body.replace(/\[@([^\]]+)\]\([^)]+\)/g, "@$1").slice(0, 60) || n.note_type}
                      </span>
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </Card>
        </div>

        <div className="min-w-0 flex-1">
          {selected ? (
            <NoteDetail
              key={selected.id}
              note={selected}
              onEdit={() => setEditing(selected)}
              onDelete={() => {
                if (confirm("Delete this note?")) {
                  remove.mutate(selected.id)
                  navigate("/notes")
                }
              }}
            />
          ) : (
            <EmptyState>Select a note, or create one.</EmptyState>
          )}
        </div>
      </div>

      {(creating || editing) && (
        <Modal
          title={editing ? "Edit note" : "New note"}
          onClose={() => {
            setEditing(null)
            setCreating(false)
          }}
        >
          <div className="max-h-[75vh] overflow-y-auto pr-1">
            <NoteEditor
              initial={editing}
              onSubmit={submit}
              onCancel={() => {
                setEditing(null)
                setCreating(false)
              }}
            />
          </div>
        </Modal>
      )}
    </div>
  )
}
