import { useRef } from "react"
import { createPortal } from "react-dom"
import { ChevronDown, ChevronUp, GripHorizontal, NotebookPen, X } from "lucide-react"
import { MomentComposer } from "@/components/MomentComposer"
import { EntityRef } from "@/components/graph/EntityRef"
import { cn } from "@/lib/utils"
import { usePersistentState } from "@/lib/persistentState"
import { useFloatingNote } from "@/notes/floatingNoteContext"
import type { Body } from "@/services/api/crud"
import { moments, useCreateMomentWithImages } from "@/services/api/hooks"
import { useEntityResolver } from "@/services/api/mentions"
import { subjectOf } from "@/lib/moments"
import type { EntityType } from "@/services/api/types"

const isDesktop = () =>
  typeof window !== "undefined" && window.matchMedia("(min-width: 1024px)").matches

/**
 * The persistent pop-out capture. Portaled to `body` (so it escapes page
 * clipping and stays fixed across navigation), draggable by its header on
 * desktop, and collapsible to a header pill. Hosts the shared `MomentComposer`:
 * a fresh moment is created on first save, after which the window flips to edit
 * mode on the same one so you keep typing into it.
 *
 * Its one job is the thought that arrives while you are doing something else —
 * which is why it survives navigation and why it never roots itself to the page
 * you happen to be on.
 */
export function FloatingNoteWindow() {
  const { target, noteId, minimized, setActiveNoteId, close, setMinimized } = useFloatingNote()
  const submitCreate = useCreateMomentWithImages()
  const update = moments.useUpdate()
  const existing = moments.useGet(noteId ?? undefined)
  const resolve = useEntityResolver()

  // Desktop drag: track the pointer offset within the header and move the window.
  // Position persists across reloads; clamped so it can never leave the viewport.
  const [pos, setPos] = usePersistentState<{ left: number; top: number } | null>(
    "floating_note_pos",
    null,
  )
  const drag = useRef<{ dx: number; dy: number } | null>(null)

  function onPointerDown(e: React.PointerEvent<HTMLElement>) {
    // Don't start a drag (and grab the pointer) when a header control is
    // clicked — that capture would eat the button's click.
    if ((e.target as HTMLElement).closest("button")) return
    if (!isDesktop()) return
    const box = e.currentTarget.parentElement?.getBoundingClientRect()
    if (!box) return
    drag.current = { dx: e.clientX - box.left, dy: e.clientY - box.top }
    e.currentTarget.setPointerCapture?.(e.pointerId)
  }
  function onPointerMove(e: React.PointerEvent<HTMLElement>) {
    if (!drag.current) return
    const maxLeft = Math.max(8, window.innerWidth - 380 - 8)
    const maxTop = Math.max(8, window.innerHeight - 48) // keep the header on-screen
    setPos({
      left: Math.min(maxLeft, Math.max(8, e.clientX - drag.current.dx)),
      top: Math.min(maxTop, Math.max(8, e.clientY - drag.current.dy)),
    })
  }
  function onPointerUp(e: React.PointerEvent<HTMLElement>) {
    drag.current = null
    e.currentTarget.releasePointerCapture?.(e.pointerId)
  }

  if (!target) return null

  // What the writing turned out to be about — filed in the composer's own About
  // picker, since nothing seeds a subject here any more. Shown as a link so you
  // can jump to the thing you just filed it under.
  const saved = existing.data ? subjectOf(existing.data) : undefined
  const rootType: EntityType | null = saved?.entity_type ?? null
  const rootId = saved?.entity_id ?? null

  let body
  if (noteId) {
    // Edit mode — keep typing into the note we created (or reopened).
    body = existing.data ? (
      <MomentComposer
        key={noteId}
        mode="edit"
        kind={existing.data.kind}
        initial={existing.data}
        onSubmit={(b: Body) => update.mutate({ id: noteId, body: b })}
      />
    ) : existing.isError ? (
      <p className="px-1 py-6 text-center text-sm text-slate-400">
        Couldn’t load this note.{" "}
        <button
          type="button"
          onClick={() => void existing.refetch()}
          className="font-medium text-indigo-600 hover:underline"
        >
          Retry
        </button>
      </p>
    ) : (
      <p className="px-1 py-6 text-center text-sm text-slate-400">Loading…</p>
    )
  } else {
    // Create mode — first save creates the note, then we flip to edit mode on it.
    body = (
      <MomentComposer
        key="new"
        mode="create"
        autoFocus
        createLabel="Save"
        placeholder="Take notes…"
        // Always a capture: the dock is what you reach for when you have a
        // thought and no page for it, so the surface genuinely cannot know what
        // you are writing — and that unresolved kind *is* the inbox, a state
        // rather than a lack. Filing it is the composer's About picker, or
        // triage later.
        kind="capture"
        onSubmit={(b, pending) => {
          void submitCreate(b, pending).then((n) => setActiveNoteId(n.id))
        }}
      />
    )
  }

  return createPortal(
    <div
      className={cn(
        "fixed z-[55] flex flex-col overflow-hidden rounded-xl border border-slate-200 bg-surface shadow-floating",
        // Mobile: a bottom sheet, lifted clear of the bottom nav. Desktop: docked bottom-right.
        "inset-x-2 bottom-16 lg:inset-x-auto lg:bottom-4 lg:right-4 lg:top-auto lg:w-[380px]",
      )}
      style={pos && isDesktop() ? { left: pos.left, top: pos.top, right: "auto", bottom: "auto" } : undefined}
    >
      <header
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        className="flex select-none items-center gap-2 border-b border-slate-100 bg-slate-50/70 px-3 py-2 lg:cursor-move"
      >
        <NotebookPen size={14} className="shrink-0 text-slate-400" />
        <span className="min-w-0 flex-1 truncate text-sm font-medium text-slate-700">Capture</span>
        <GripHorizontal size={14} className="hidden shrink-0 text-slate-300 lg:block" />
        <button
          type="button"
          title={minimized ? "Expand" : "Minimize"}
          onClick={() => setMinimized(!minimized)}
          className="rounded p-1 text-slate-400 transition hover:bg-slate-200/60 hover:text-slate-700"
        >
          {minimized ? <ChevronUp size={15} /> : <ChevronDown size={15} />}
        </button>
        <button
          type="button"
          title="Close"
          onClick={close}
          className="rounded p-1 text-slate-400 transition hover:bg-slate-200/60 hover:text-red-600"
        >
          <X size={15} />
        </button>
      </header>
      {!minimized && rootType && rootId && (
        <div className="border-b border-slate-100 bg-slate-50/40 px-3 py-1.5 text-xs text-slate-500">
          in{" "}
          <EntityRef type={rootType} id={rootId} className="font-medium text-slate-700">
            {resolve(rootType, rootId) ?? "…"}
          </EntityRef>
        </div>
      )}
      {!minimized && <div className="max-h-[60vh] overflow-y-auto p-3">{body}</div>}
    </div>,
    document.body,
  )
}
