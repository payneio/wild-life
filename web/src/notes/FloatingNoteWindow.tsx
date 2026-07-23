import { useRef, useState } from "react"
import { createPortal } from "react-dom"
import { ChevronDown, ChevronUp, GripHorizontal, NotebookPen, X } from "lucide-react"
import { NoteComposer } from "@/components/NoteComposer"
import { EntityRef } from "@/components/graph/EntityRef"
import { cn } from "@/lib/utils"
import { useFloatingNote } from "@/notes/floatingNoteContext"
import type { Body } from "@/services/api/crud"
import { notes, useCreateNoteWithImages } from "@/services/api/hooks"
import { useEntityResolver } from "@/services/api/mentions"
import type { EntityType } from "@/services/api/types"

const isDesktop = () =>
  typeof window !== "undefined" && window.matchMedia("(min-width: 1024px)").matches

/**
 * The persistent pop-out note. Portaled to `body` (so it escapes page clipping
 * and stays fixed across navigation), draggable by its header on desktop, and
 * collapsible to a header pill. Hosts the shared `NoteComposer`: a fresh note is
 * created on first save, after which the window flips to edit mode on the same
 * note so you keep typing into it.
 */
export function FloatingNoteWindow() {
  const { target, noteId, minimized, setActiveNoteId, close, setMinimized } = useFloatingNote()
  const submitCreate = useCreateNoteWithImages()
  const update = notes.useUpdate()
  const existing = notes.useGet(noteId ?? undefined)
  const resolve = useEntityResolver()

  // Desktop drag: track the pointer offset within the header and move the window.
  const [pos, setPos] = useState<{ left: number; top: number } | null>(null)
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
    setPos({
      left: Math.max(8, e.clientX - drag.current.dx),
      top: Math.max(8, e.clientY - drag.current.dy),
    })
  }
  function onPointerUp(e: React.PointerEvent<HTMLElement>) {
    drag.current = null
    e.currentTarget.releasePointerCapture?.(e.pointerId)
  }

  if (!target) return null

  const noteType = existing.data?.note_type ?? target.noteType
  const heading = noteType === "meeting" ? "Meeting notes" : "Note"
  // The note's base entity — from the saved note, or the pending owner while
  // still composing — shown as a link so you can jump back to it.
  const rootType =
    (existing.data?.entity_type as EntityType | null | undefined) ?? target.owner?.type ?? null
  const rootId = existing.data?.entity_id ?? target.owner?.id ?? null

  let body
  if (noteId) {
    // Edit mode — keep typing into the note we created (or reopened).
    body = existing.data ? (
      <NoteComposer
        key={noteId}
        mode="edit"
        initial={existing.data}
        onSubmit={(b: Body) => update.mutate({ id: noteId, body: b })}
      />
    ) : (
      <p className="px-1 py-6 text-center text-sm text-slate-400">Loading…</p>
    )
  } else {
    // Create mode — first save creates the note (rooted to the target owner),
    // then we flip to edit mode on it.
    body = (
      <NoteComposer
        key="new"
        mode="create"
        autoFocus
        placeholder="Take notes…"
        onSubmit={(b, pending) => {
          const rooted: Body = {
            ...b,
            ...(target.owner ? { entity_type: target.owner.type, entity_id: target.owner.id } : {}),
            ...(target.noteType ? { note_type: target.noteType } : {}),
          }
          void submitCreate(rooted, pending).then((n) => setActiveNoteId(n.id))
        }}
      />
    )
  }

  return createPortal(
    <div
      className={cn(
        "fixed z-[55] flex flex-col overflow-hidden rounded-xl border border-slate-200 bg-surface shadow-floating",
        // Mobile: a bottom sheet spanning the width. Desktop: docked bottom-right.
        "inset-x-2 bottom-2 lg:inset-x-auto lg:bottom-4 lg:right-4 lg:top-auto lg:w-[380px]",
      )}
      style={pos ? { left: pos.left, top: pos.top, right: "auto", bottom: "auto" } : undefined}
    >
      <header
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        className="flex select-none items-center gap-2 border-b border-slate-100 bg-slate-50/70 px-3 py-2 lg:cursor-move"
      >
        <NotebookPen size={14} className="shrink-0 text-slate-400" />
        <span className="min-w-0 flex-1 truncate text-sm font-medium text-slate-700">{heading}</span>
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
          On{" "}
          <EntityRef type={rootType} id={rootId} className="font-medium text-slate-700">
            {resolve(rootType, rootId) ?? rootType}
          </EntityRef>
        </div>
      )}
      {!minimized && <div className="max-h-[60vh] overflow-y-auto p-3">{body}</div>}
    </div>,
    document.body,
  )
}
