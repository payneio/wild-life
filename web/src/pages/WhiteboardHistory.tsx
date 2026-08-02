import { useState } from "react"
import { Card } from "@/components/ui/primitives"
import { apiClient } from "@/services/api/client"
import {
  useSaveWhiteboard,
  type WhiteboardRead,
  type WhiteboardRevision,
} from "@/services/api/hooks"

/**
 * What the buffer used to hold, one entry per editing session.
 *
 * This is not a collection view and the whiteboard has not become a collection:
 * revisions have no identity you can link to, nothing lists them anywhere else,
 * and they are absent from the registry and the timeline. It is an undo buffer
 * with a lid on it — the answer to a write you regret, which before 2026-08-01
 * was "read the dead tuples out of the heap before autovacuum runs".
 *
 * Restoring is an ordinary write, so it is itself recoverable and it takes the
 * same version precondition as any other.
 */
export function WhiteboardHistory({
  revisions,
  isLoading,
  current,
  onClose,
  onRestored,
}: {
  revisions: WhiteboardRevision[]
  isLoading: boolean
  current: WhiteboardRead | undefined
  onClose: () => void
  onRestored: () => void
}) {
  const save = useSaveWhiteboard()
  const [busy, setBusy] = useState<string | null>(null)

  const restore = async (rev: WhiteboardRevision) => {
    if (!current) return
    setBusy(rev.id)
    try {
      const full = await apiClient.get<{ content: string }>(`/whiteboard/revisions/${rev.id}`)
      await save.mutateAsync({ content: full.content, base_version: current.version })
      onRestored()
    } finally {
      setBusy(null)
    }
  }

  return (
    <Card className="space-y-2 p-3">
      <div className="flex items-center justify-between">
        <h2 className="text-sm font-medium text-slate-700">Earlier versions</h2>
        <button type="button" onClick={onClose} className="text-xs text-slate-400">
          Close
        </button>
      </div>
      {isLoading ? (
        <p className="text-sm text-slate-500">Loading…</p>
      ) : revisions.length === 0 ? (
        <p className="text-sm text-slate-500">
          Nothing displaced yet — a version is kept when a new session writes over the last
          one's final state.
        </p>
      ) : (
        <ul className="divide-y divide-slate-100">
          {revisions.map((rev) => (
            <li key={rev.id} className="flex items-start gap-3 py-2">
              <div className="min-w-0 flex-1">
                <div className="text-xs text-slate-500">
                  {new Date(rev.replaced_at).toLocaleString()} · {rev.size.toLocaleString()}{" "}
                  characters
                </div>
                <div className="truncate font-mono text-xs text-slate-400">{rev.preview}</div>
              </div>
              <button
                type="button"
                disabled={busy !== null || !current}
                onClick={() => void restore(rev)}
                className="shrink-0 text-xs text-slate-500 underline disabled:opacity-40"
              >
                {busy === rev.id ? "Restoring…" : "Restore"}
              </button>
            </li>
          ))}
        </ul>
      )}
    </Card>
  )
}
