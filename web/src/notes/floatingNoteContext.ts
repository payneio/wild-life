import { createContext, useContext } from "react"

/**
 * What to open the dock on. `null` target = dock closed.
 *
 * There is deliberately nothing here naming a subject. The dock is **capture
 * from anywhere** — ⌘⇧N, no page, no root, and that unresolved kind is the
 * Inbox. Writing *about* something has one place, the Log band on that thing's
 * record, and it was the pop-out's ability to be a second one that let a record
 * offer two composers for the same act.
 */
export interface FloatingNoteTarget {
  /** Reopen an existing note in edit mode. */
  noteId?: string
}

export interface FloatingNoteState {
  target: FloatingNoteTarget | null
  /** The active note's id once it exists (persisted so the dock survives reloads). */
  noteId: string | null
  minimized: boolean
  openNote: (t: FloatingNoteTarget) => void
  /** Called after a fresh note is created so the window flips create → edit. */
  setActiveNoteId: (id: string) => void
  close: () => void
  setMinimized: (v: boolean) => void
}

export const FloatingNoteContext = createContext<FloatingNoteState | null>(null)

export function useFloatingNote(): FloatingNoteState {
  const ctx = useContext(FloatingNoteContext)
  if (!ctx) throw new Error("useFloatingNote must be used within FloatingNoteProvider")
  return ctx
}
