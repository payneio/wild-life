import { useEffect, useMemo, useRef, useState } from "react"
import { Eye, Home, Image as ImageIcon, Link2, PencilLine, Settings2, X } from "lucide-react"
import { AutoTextarea } from "@/components/AutoTextarea"
import { EntityCombobox } from "@/components/EntityCombobox"
import { MentionText } from "@/components/MentionText"
import { Button, Field, Input } from "@/components/ui/primitives"
import { asDay, dayOf, localInputToInstant, today } from "@/lib/date"
import type { Body } from "@/services/api/crud"
import {
  mentionToken,
  mergeLinks,
  useEntityResolver,
  type MentionResult,
} from "@/services/api/mentions"
import {
  momentImageToken,
  pendingImageToken,
  uploadMomentImage,
  type PendingImage,
} from "@/services/api/momentImages"
import { HomePicker } from "@/components/graph/HomePicker"
import { subjectOf } from "@/lib/moments"
import type { EntityType, Moment, MomentKind, MomentLink } from "@/services/api/types"

const BODY_CLS =
  "w-full rounded-lg border border-slate-300 bg-surface px-3 py-2 text-sm outline-none focus:border-indigo-500 focus:ring-2 focus:ring-indigo-100"

/** The roles the composer owns. Anything else on a moment it edits — a
 *  `participant` matched from an invitation, a `place` from a visit — belongs to
 *  the surface that wrote it, and is carried through untouched: `PATCH /moments`
 *  reconciles links wholesale, so sending only what we manage would delete the
 *  rest. */
const COMPOSED_ROLES = new Set(["subject", "mention"])

/**
 * The one composer, for prose of any kind.
 *
 * `kind` is a **prop, never a control** — the surface that creates a moment knows
 * what act it is, and asking the user is what left `Event.event_type` null on
 * 1,283 of 1,332 rows. The journal writes `reflection`, a record's Log writes
 * `observation`, quick capture writes `capture`, and that unresolved kind *is*
 * the inbox.
 *
 * What the writer *is* asked is what the writing is about, which is a `subject`
 * link rather than a genre: an entry about a program concerns the program.
 */
export function MomentComposer({
  kind,
  initial,
  onSubmit,
  onCancel,
  mode,
  autoFocus,
  focusSignal,
  compact,
  placeholder = "What's on your mind?",
  createLabel = "Post",
  defaultSubject = null,
}: {
  /** The act this surface creates. Ignored in edit mode — an act doesn't change
   *  because you fixed a typo; re-filing it is what the About picker does. */
  kind: MomentKind
  initial?: Moment | null
  onSubmit: (body: Body, pending: PendingImage[]) => void
  onCancel?: () => void
  mode: "create" | "edit"
  autoFocus?: boolean
  /** Focus on demand: a changed value puts the cursor here. For a surface that
   *  wants to hand the writer over without owning the composer's ref — a record
   *  jumping to its Log band. */
  focusSignal?: number
  compact?: boolean
  placeholder?: string
  /** Label for the create-mode submit button ("Post" in the journal, "Save" in the dock). */
  createLabel?: string
  /** Pre-filed: what a new moment here is about (a record's Log, say). */
  defaultSubject?: { type: EntityType; id: string } | null
}) {
  const resolve = useEntityResolver()
  const [title, setTitle] = useState(initial?.title ?? "")
  // What the writing is *about*. Seeded from the row being edited: `PATCH`
  // replaces links wholesale, so an unseeded picker would silently unfile every
  // moment it touched.
  const initialSubject = initial ? subjectOf(initial) : undefined
  const [subject, setSubject] = useState<{ type: EntityType; id: string } | null>(
    initialSubject
      ? { type: initialSubject.entity_type, id: initialSubject.entity_id }
      : defaultSubject,
  )
  const [day, setDay] = useState(
    initial?.started_at ? dayOf(initial.started_at) : today(),
  )
  const [body, setBody] = useState(initial?.body ?? "")
  const [details, setDetails] = useState(false)
  const [preview, setPreview] = useState(false)
  const [pending, setPending] = useState<PendingImage[]>([])
  const taRef = useRef<HTMLTextAreaElement>(null)
  const imgInputRef = useRef<HTMLInputElement>(null)

  // Skips the initial render: an undefined/first signal must not focus, or
  // every mounted composer would be `autoFocus` again by another name.
  const lastSignal = useRef(focusSignal)
  useEffect(() => {
    if (focusSignal === undefined || focusSignal === lastSignal.current) return
    lastSignal.current = focusSignal
    taRef.current?.focus()
  }, [focusSignal])

  // Links this composer does not own, preserved verbatim across a save.
  const foreignLinks = useMemo<MomentLink[]>(
    () => (initial?.links ?? []).filter((l) => !COMPOSED_ROLES.has(l.role)),
    [initial],
  )

  const [manual, setManual] = useState<MentionResult[]>(() => {
    const inlineKeys = new Set(mergeLinks(initial?.body ?? "", []).map((r) => `${r.type}:${r.id}`))
    return (initial?.links ?? [])
      .filter((l) => l.role === "mention" && !inlineKeys.has(`${l.entity_type}:${l.entity_id}`))
      .map((l) => ({
        type: l.entity_type,
        id: l.entity_id,
        label: resolve(l.entity_type, l.entity_id) ?? "…",
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

  /** Attach an image: upload now if the moment already exists (edit), else hold
   *  it as pending and let the parent upload it once the moment is created. */
  async function attachImage(file: File) {
    if (!file.type.startsWith("image/")) return
    if (mode === "edit" && initial?.id) {
      const img = await uploadMomentImage(initial.id, file)
      insertAtCursor(`\n\n${momentImageToken(img.id)}\n\n`)
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
    const composed: MomentLink[] = [
      ...(subject
        ? [{ role: "subject" as const, entity_type: subject.type, entity_id: subject.id }]
        : []),
      ...mergeLinks(body, manual).map((r) => ({
        role: "mention" as const,
        entity_type: r.type,
        entity_id: r.id,
      })),
    ]
    onSubmit(
      {
        // Prose is day-precision — "what day did you write that" is the question,
        // and the clock time isn't the point. Noon rather than midnight so the
        // day can't slide across the date line when rendered locally.
        started_at: localInputToInstant(`${day}T12:00`),
        all_day: true,
        title: title || null,
        body,
        links: [...composed, ...foreignLinks],
        // Only on create: the surface declares the act once, and an edit that
        // restated it would let a typo fix reclassify a reflection.
        ...(mode === "create" ? { kind } : {}),
      },
      pending,
    )
    if (mode === "create") {
      setBody("")
      setManual([])
      setTitle("")
      setPending([])
      setDetails(false)
      setPreview(false)
      setSubject(defaultSubject)
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
            {/* A mention names something; writing about a finished project is
                the normal case. */}
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
          {/* A mention names something the writing touches; a subject says what
              the writing *is about*. Offering it here is what stops "I'll file it
              later" from being the only option — filing later is the inbox. */}
          <Field label="About" className="col-span-2">
            {subject ? (
              <div className="flex items-center gap-2">
                <span className="inline-flex w-fit items-center gap-1 rounded-md bg-indigo-600 px-2 py-0.5 text-xs font-medium text-white">
                  <Home size={11} /> {resolve(subject.type, subject.id) ?? "…"}
                </span>
                <button
                  type="button"
                  className="text-slate-400 transition hover:text-red-600"
                  title="Not about anything in particular"
                  onClick={() => setSubject(null)}
                >
                  <X size={12} />
                </button>
              </div>
            ) : (
              <HomePicker
                label="About…"
                placeholder="What's this about? (any area, project, person…)"
                onPick={(type, id) => setSubject({ type, id })}
              />
            )}
          </Field>
          <Field label="Date" className="col-span-2">
            <Input type="date" value={day} onChange={(e) => setDay(asDay(e.target.value))} />
          </Field>
        </div>
      )}

      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-1 text-slate-400">
          <button
            type="button"
            title="Details (title, date, what it's about)"
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
