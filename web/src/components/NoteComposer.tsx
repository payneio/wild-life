import { useMemo, useRef, useState } from "react"
import { Eye, Home, Image as ImageIcon, Link2, PencilLine, Settings2, X } from "lucide-react"
import { AutoTextarea } from "@/components/AutoTextarea"
import { EntityCombobox } from "@/components/EntityCombobox"
import { MentionText } from "@/components/MentionText"
import { Button, Field, Input } from "@/components/ui/primitives"
import { todayISO } from "@/lib/format"
import { asDay } from "@/lib/date"
import type { Body } from "@/services/api/crud"
import {
  mentionToken,
  mergeLinks,
  useEntityResolver,
  type MentionResult,
} from "@/services/api/mentions"
import {
  noteImageToken,
  pendingImageToken,
  uploadNoteImage,
  type PendingImage,
} from "@/services/api/noteImages"
import { HomePicker } from "@/components/graph/HomePicker"
import type { EntityType, Note } from "@/services/api/types"

const BODY_CLS =
  "w-full rounded-lg border border-slate-300 bg-surface px-3 py-2 text-sm outline-none focus:border-indigo-500 focus:ring-2 focus:ring-indigo-100"

/**
 * The journal composer: a minimal body box with inline @-mentions, a collapsible
 * details panel (title/date/mood/tags/about), a linked-entity chips row, and
 * ⌘/Ctrl+Enter to save. Used both as the always-on composer at the top of the
 * Notes stream and for inline entry editing.
 */
export function NoteComposer({
  initial,
  onSubmit,
  onCancel,
  mode,
  autoFocus,
  compact,
  placeholder = "What's on your mind?",
  createLabel = "Post",
  defaultRoot = null,
}: {
  initial?: Note | null
  onSubmit: (body: Body, pending: PendingImage[]) => void
  onCancel?: () => void
  mode: "create" | "edit"
  autoFocus?: boolean
  compact?: boolean
  placeholder?: string
  /** Label for the create-mode submit button ("Post" in the journal, "Save" in the dock). */
  createLabel?: string
  /** Pre-filed: what a new note here is about (a record's Notes panel, say). */
  defaultRoot?: { type: EntityType; id: string } | null
}) {
  const resolve = useEntityResolver()
  const [title, setTitle] = useState(initial?.title ?? "")
  // What the note is *about*, as opposed to the genre it is. Seeded from the row
  // being edited: `update_note` uses `exclude_unset`, so a root used to survive an
  // edit by omission — now that the composer can write the pair, an unseeded
  // picker would silently unroot every note it touches. `rootTouched` keeps the
  // pair out of the payload entirely until the user actually chooses.
  const [root, setRoot] = useState<{ type: EntityType; id: string } | null>(
    initial?.entity_type && initial?.entity_id
      ? { type: initial.entity_type, id: initial.entity_id }
      : defaultRoot,
  )
  const [rootTouched, setRootTouched] = useState(false)
  const [entryDate, setEntryDate] = useState(initial?.entry_date ?? todayISO())
  const [mood, setMood] = useState(initial?.mood ?? "")
  const [tags, setTags] = useState((initial?.tags ?? []).join(", "))
  const [body, setBody] = useState(initial?.body ?? "")
  const [details, setDetails] = useState(false)
  const [preview, setPreview] = useState(false)
  const [pending, setPending] = useState<PendingImage[]>([])
  const taRef = useRef<HTMLTextAreaElement>(null)
  const imgInputRef = useRef<HTMLInputElement>(null)

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

  const [mentionAt, setMentionAt] = useState<number | null>(null)
  const [chipPicker, setChipPicker] = useState(false)

  const links = useMemo(() => mergeLinks(body, manual), [body, manual])

  function onBodyChange(e: React.ChangeEvent<HTMLTextAreaElement>) {
    const val = e.target.value
    const caret = e.target.selectionStart
    setBody(val)
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

  function insertAtCursor(text: string) {
    const ta = taRef.current
    const at = ta ? ta.selectionStart : body.length
    setBody((b) => `${b.slice(0, at)}${text}${b.slice(at)}`)
    setTimeout(() => taRef.current?.focus(), 0)
  }

  /** Attach an image: upload now if the note already exists (edit), else hold it
   *  as pending and let the parent upload it once the note is created. */
  async function attachImage(file: File) {
    if (!file.type.startsWith("image/")) return
    if (mode === "edit" && initial?.id) {
      const img = await uploadNoteImage(initial.id, file)
      insertAtCursor(`\n\n${noteImageToken(img.id)}\n\n`)
    } else {
      const tmp = crypto.randomUUID()
      setPending((p) => [...p, { tmp, file }])
      insertAtCursor(`\n\n${pendingImageToken(tmp)}\n\n`)
    }
  }

  function onPickImage(e: React.ChangeEvent<HTMLInputElement>) {
    Array.from(e.target.files ?? []).forEach(attachImage)
    e.target.value = ""
  }

  function onPaste(e: React.ClipboardEvent<HTMLTextAreaElement>) {
    const files = Array.from(e.clipboardData?.items ?? [])
      .filter((it) => it.type.startsWith("image/"))
      .map((it) => it.getAsFile())
      .filter((f): f is File => f != null)
    if (files.length) {
      e.preventDefault()
      files.forEach(attachImage)
    }
  }

  function onDrop(e: React.DragEvent<HTMLTextAreaElement>) {
    const files = Array.from(e.dataTransfer?.files ?? []).filter((f) => f.type.startsWith("image/"))
    if (files.length) {
      e.preventDefault()
      files.forEach(attachImage)
    }
  }

  function labelFor(r: MentionResult): string {
    return r.label && r.label !== "…" ? r.label : (resolve(r.type, r.id) ?? r.label)
  }

  function submit() {
    if (mode === "create" && !body.trim()) return
    onSubmit(
      {
        title: title || null,
        entry_date: entryDate || null,
        mood: mood || null,
        tags: tags.split(",").map((t) => t.trim()).filter(Boolean),
        body,
        links: mergeLinks(body, manual).map((r) => ({ target_type: r.type, target_id: r.id })),
        // Omitted unless chosen — see `rootTouched` above.
        ...(mode === "create" || rootTouched
          ? { entity_type: root?.type ?? null, entity_id: root?.id ?? null }
          : {}),
      },
      pending,
    )
    if (mode === "create") {
      setBody("")
      setManual([])
      setTitle("")
      setMood("")
      setTags("")
      setPending([])
      setDetails(false)
      setPreview(false)
      setRoot(defaultRoot)
      setRootTouched(false)
      setTimeout(() => taRef.current?.focus(), 0)
    }
  }

  function onKeyDown(e: React.KeyboardEvent) {
    if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) {
      e.preventDefault()
      submit()
    }
  }

  return (
    <div className="space-y-2">
      <div className="relative">
        {preview ? (
          <div className={`${BODY_CLS} min-h-16`} onClick={() => setPreview(false)}>
            <MentionText>{body || "_Nothing yet — click to edit._"}</MentionText>
          </div>
        ) : (
          <AutoTextarea
            ref={taRef}
            // Only auto-focus on desktop: on mobile it pops the on-screen
            // keyboard on page load, which hides the fixed bottom nav.
            autoFocus={
              autoFocus &&
              typeof window !== "undefined" &&
              window.matchMedia("(min-width: 1024px)").matches
            }
            className={`${BODY_CLS} ${compact ? "min-h-10" : "min-h-16"}`}
            value={body}
            placeholder={placeholder}
            onChange={onBodyChange}
            onKeyDown={onKeyDown}
            onPaste={onPaste}
            onDrop={onDrop}
            onDragOver={(e) => e.preventDefault()}
          />
        )}
        {mentionAt != null && (
          <div className="absolute left-2 top-full z-20 mt-1">
            {/* A mention names something; a journal entry about a finished
                project is the normal case. */}
            <EntityCombobox
              intent="reference"
              onSelect={insertMention}
              onClose={() => setMentionAt(null)}
            />
          </div>
        )}
      </div>

      {(links.length > 0 || chipPicker) && (
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
          {chipPicker && (
            <EntityCombobox
              intent="reference"
              onSelect={(r) => {
                setManual((m) => (m.some((x) => x.type === r.type && x.id === r.id) ? m : [...m, r]))
                setChipPicker(false)
              }}
              onClose={() => setChipPicker(false)}
            />
          )}
        </div>
      )}

      {details && (
        <div className="grid grid-cols-2 gap-2 rounded-lg border border-slate-100 bg-slate-50/50 p-2">
          <Field label="Title" className="col-span-2">
            <Input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Optional title" />
          </Field>
          {/* A mention names something the writing touches; a root says what the
              writing *is about*. Offering it here is what stops "I'll file it
              later" from being the only option — filing later is the inbox. */}
          <Field label="About" className="col-span-2">
            {root ? (
              <div className="flex items-center gap-2">
                <span className="inline-flex w-fit items-center gap-1 rounded-md bg-indigo-600 px-2 py-0.5 text-xs font-medium text-white">
                  <Home size={11} /> {resolve(root.type, root.id) ?? "…"}
                </span>
                <button
                  type="button"
                  className="text-slate-400 transition hover:text-red-600"
                  title="Not about anything in particular"
                  onClick={() => {
                    setRoot(null)
                    setRootTouched(true)
                  }}
                >
                  <X size={12} />
                </button>
              </div>
            ) : (
              <HomePicker
                label="About…"
                placeholder="What's this about? (any area, project, person…)"
                onPick={(type, id) => {
                  setRoot({ type, id })
                  setRootTouched(true)
                }}
              />
            )}
          </Field>
          <Field label="Date">
            <Input type="date" value={entryDate} onChange={(e) => setEntryDate(asDay(e.target.value))} />
          </Field>
          <Field label="Mood">
            <Input value={mood} onChange={(e) => setMood(e.target.value)} />
          </Field>
          <Field label="Tags">
            <Input value={tags} placeholder="comma, separated" onChange={(e) => setTags(e.target.value)} />
          </Field>
        </div>
      )}

      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-1 text-slate-400">
          <button
            type="button"
            title="Details (title, date, mood, tags, what it's about)"
            className={`rounded p-1 hover:bg-slate-100 hover:text-slate-600 ${details ? "bg-slate-100 text-slate-600" : ""}`}
            onClick={() => setDetails((v) => !v)}
          >
            <Settings2 size={15} />
          </button>
          <button
            type="button"
            title="Link an entity"
            className="rounded p-1 hover:bg-slate-100 hover:text-slate-600"
            onClick={() => setChipPicker((v) => !v)}
          >
            <Link2 size={15} />
          </button>
          <button
            type="button"
            title="Add image (or paste / drag one in)"
            className="rounded p-1 hover:bg-slate-100 hover:text-slate-600"
            onClick={() => imgInputRef.current?.click()}
          >
            <ImageIcon size={15} />
          </button>
          <input
            ref={imgInputRef}
            type="file"
            accept="image/*"
            multiple
            className="hidden"
            onChange={onPickImage}
          />
          <button
            type="button"
            title={preview ? "Edit" : "Preview"}
            className={`rounded p-1 hover:bg-slate-100 hover:text-slate-600 ${preview ? "bg-slate-100 text-slate-600" : ""}`}
            onClick={() => setPreview((v) => !v)}
          >
            {preview ? <PencilLine size={15} /> : <Eye size={15} />}
          </button>
        </div>
        <div className="flex items-center gap-2">
          {mode === "edit" && onCancel && (
            <Button variant="secondary" onClick={onCancel}>Cancel</Button>
          )}
          <span className="hidden text-xs text-slate-300 sm:inline">⌘⏎</span>
          <Button onClick={submit} disabled={mode === "create" && !body.trim()}>
            {mode === "edit" ? "Save" : createLabel}
          </Button>
        </div>
      </div>
    </div>
  )
}
