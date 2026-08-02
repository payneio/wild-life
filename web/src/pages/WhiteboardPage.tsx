import { useCallback, useEffect, useRef, useState } from "react"
import { History, StickyNote } from "lucide-react"
import { onlineManager, useQueryClient } from "@tanstack/react-query"
import { AutoTextarea } from "@/components/AutoTextarea"
import { Card } from "@/components/ui/primitives"
import { ApiError } from "@/services/api/client"
import {
  useSaveWhiteboard,
  useWhiteboard,
  useWhiteboardRevisions,
  type WhiteboardRead,
} from "@/services/api/hooks"
import { WhiteboardHistory } from "@/pages/WhiteboardHistory"

/**
 * One scratch space to mess around in — not a collection of notes.
 *
 * It has no subject, no date and no identity, which is exactly why it is not a
 * Note and not an entity: nothing links to it, nothing lists it, and its writes
 * stay out of `change_log` so a buffer you retype all day never floods the
 * history feed with domain changes it isn't making.
 *
 * Saves on a debounce rather than a button, because a whiteboard you have to
 * remember to save is one you will lose.
 *
 * **Nothing is editable until the buffer has actually arrived.** On 2026-08-01
 * this page was opened offline, where a paused query leaves `data` undefined;
 * it rendered that as an empty buffer, over 2,755 bytes of notes, and reported
 * "Saved" while doing so. An unloaded buffer is not an empty one, and the two
 * are now different screens. Every write also names the version it is replacing
 * (see `useSaveWhiteboard`), so even a confused client cannot overwrite text it
 * never read — the guard is in the type, not in this component's vigilance.
 */
const SAVE_DEBOUNCE_MS = 800

type SaveState = "saved" | "saving" | "offline" | "conflict" | "error"

export function WhiteboardPage() {
  const query = useWhiteboard()
  const board = query.data
  return (
    <div className="space-y-3">
      <Header board={board} query={query} />
      {board ? (
        <Editor board={board} />
      ) : (
        <Card className="p-6">
          <p className="text-sm text-slate-500">
            {query.isError
              ? "Couldn't load the whiteboard. Nothing here is editable until it arrives — what you can't see, you can't safely write over."
              : onlineManager.isOnline()
                ? "Loading…"
                : "Offline, so the whiteboard hasn't loaded. It will appear when you reconnect."}
          </p>
        </Card>
      )}
    </div>
  )
}

function Header({
  board,
  query,
}: {
  board: WhiteboardRead | undefined
  query: ReturnType<typeof useWhiteboard>
}) {
  const [showHistory, setShowHistory] = useState(false)
  const revisions = useWhiteboardRevisions(showHistory)
  return (
    <>
      <div className="flex items-end justify-between gap-3">
        <div>
          <h1 className="flex items-center gap-2 text-lg font-semibold text-slate-900">
            <StickyNote size={20} className="text-slate-400" /> Whiteboard
          </h1>
          <p className="text-sm text-slate-500">
            One space to think in. Nothing here is filed anywhere — write something down
            properly when it turns out to matter.
          </p>
        </div>
        <button
          type="button"
          onClick={() => setShowHistory((v) => !v)}
          className="flex shrink-0 items-center gap-1.5 text-xs text-slate-400 hover:text-slate-600"
        >
          <History size={14} /> History
        </button>
      </div>
      {showHistory && (
        <WhiteboardHistory
          revisions={revisions.data ?? []}
          isLoading={revisions.isLoading}
          current={board}
          onClose={() => setShowHistory(false)}
          onRestored={() => {
            setShowHistory(false)
            void query.refetch()
          }}
        />
      )}
    </>
  )
}

function Editor({ board }: { board: WhiteboardRead }) {
  const save = useSaveWhiteboard()
  const qc = useQueryClient()
  // Null until you type: the server value shows through, and once you take over
  // the draft wins. Derived rather than synced by an effect, so a refetch can
  // never yank the cursor mid-sentence.
  const [draft, setDraft] = useState<string | null>(null)
  const [state, setState] = useState<SaveState>("saved")
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null)
  // What still needs to reach the server. Held in a ref so the reconnect
  // handler below sends the latest text rather than whatever was current when
  // it subscribed.
  const unsaved = useRef<string | null>(null)
  const text = draft ?? board.content

  const flush = useCallback(() => {
    const content = unsaved.current
    if (content === null) return
    setState("saving")
    save.mutate(
      { content, base_version: board.version },
      {
        onSuccess: () => {
          unsaved.current = null
          setState("saved")
        },
        onError: (err) => {
          // The text stays in `unsaved`, so nothing is dropped by a failure.
          if (err instanceof ApiError && err.status === 409) {
            setState("conflict")
            // Fetch what is actually there, so that choosing to overwrite is a
            // decision about a known version rather than a retry against a
            // number that will just be refused again.
            void qc.invalidateQueries({ queryKey: ["whiteboard"] })
          } else if (!onlineManager.isOnline()) setState("offline")
          else setState("error")
        },
      },
    )
  }, [save, qc, board.version])

  // Take the server's copy and drop yours. Only reachable from the conflict
  // bar, where you have been told the two differ.
  const discard = () => {
    unsaved.current = null
    setDraft(null)
    setState("saved")
  }

  // Offline saves fail rather than queue (see `useSaveWhiteboard`), so the one
  // pending draft is sent when the connection returns — once, at the version
  // the buffer is actually at.
  useEffect(() => onlineManager.subscribe((online) => online && flush()), [flush])

  const onChange = (next: string) => {
    setDraft(next)
    unsaved.current = next
    setState("saving")
    if (timer.current) clearTimeout(timer.current)
    timer.current = setTimeout(flush, SAVE_DEBOUNCE_MS)
  }

  return (
    <>
      <div className="flex justify-end">
        <StatusLine state={state} onRetry={flush} onDiscard={discard} />
      </div>
      <Card className="p-3">
        <AutoTextarea
          value={text}
          onChange={(e) => onChange(e.target.value)}
          placeholder="Scratch…"
          className="min-h-[70vh] w-full bg-transparent font-mono text-sm outline-none"
        />
      </Card>
    </>
  )
}

function StatusLine({
  state,
  onRetry,
  onDiscard,
}: {
  state: SaveState
  onRetry: () => void
  onDiscard: () => void
}) {
  if (state === "saved") return <span className="text-xs text-slate-400">Saved</span>
  if (state === "saving") return <span className="text-xs text-slate-400">Saving…</span>
  if (state === "offline")
    return (
      <span className="text-xs text-amber-600">
        Offline — your edits are here but not saved yet
      </span>
    )
  if (state === "conflict")
    return (
      <span className="flex items-center gap-2 text-xs text-amber-600">
        Changed somewhere else since you loaded it.
        <button type="button" onClick={onRetry} className="underline">
          Keep mine
        </button>
        <button type="button" onClick={onDiscard} className="underline">
          Take theirs
        </button>
      </span>
    )
  return (
    <button type="button" onClick={onRetry} className="text-xs text-rose-600 underline">
      Couldn't save — retry
    </button>
  )
}
