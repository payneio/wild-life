import { useCallback, useMemo, useState, type ReactNode } from "react"
import { usePersistentState } from "@/lib/persistentState"
import { FloatingNoteContext, type FloatingNoteState, type FloatingNoteTarget } from "@/notes/floatingNoteContext"

/**
 * Holds the popped-out note across route changes. Mounted above the router (in
 * App.tsx) so the state never resets on navigation. The window itself is
 * rendered by the always-mounted shell (`Layout`) so it lives *inside* the
 * router and can navigate back to a note's base entity. The active note id +
 * minimized flag persist to localStorage, so the dock reappears after a reload.
 */
export function FloatingNoteProvider({ children }: { children: ReactNode }) {
  const [noteId, setNoteId] = usePersistentState<string | null>("floating_note_id", null)
  const [minimized, setMinimizedState] = usePersistentState<boolean>("floating_note_min", false)
  // Seed the open intent from the persisted id so the dock survives reloads.
  const [target, setTarget] = useState<FloatingNoteTarget | null>(() =>
    noteId ? { noteId } : null,
  )

  const openNote = useCallback(
    (t: FloatingNoteTarget) => {
      setTarget(t)
      setNoteId(t.noteId ?? null)
      setMinimizedState(false)
    },
    [setNoteId, setMinimizedState],
  )

  const setActiveNoteId = useCallback((id: string) => setNoteId(id), [setNoteId])

  const close = useCallback(() => {
    setTarget(null)
    setNoteId(null)
  }, [setNoteId])

  const setMinimized = useCallback((v: boolean) => setMinimizedState(v), [setMinimizedState])

  const value = useMemo<FloatingNoteState>(
    () => ({ target, noteId, minimized, openNote, setActiveNoteId, close, setMinimized }),
    [target, noteId, minimized, openNote, setActiveNoteId, close, setMinimized],
  )

  return <FloatingNoteContext value={value}>{children}</FloatingNoteContext>
}
