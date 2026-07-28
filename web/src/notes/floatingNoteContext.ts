import { createContext, useContext } from "react"
import type { EntityType } from "@/services/api/types"

/** What to open the dock on. `null` target = dock closed. */
export interface FloatingNoteTarget {
  /** Reopen an existing note in edit mode. */
  noteId?: string
  /** Root the (new) note to this entity via its scalar entity_type/entity_id. */
  owner?: { type: EntityType; id: string }
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
