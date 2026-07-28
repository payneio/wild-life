import { useRef, useState } from "react"
import { StickyNote } from "lucide-react"
import { AutoTextarea } from "@/components/AutoTextarea"
import { Card } from "@/components/ui/primitives"
import { useWhiteboard, useSaveWhiteboard } from "@/services/api/hooks"

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
 */
const SAVE_DEBOUNCE_MS = 800

export function WhiteboardPage() {
  const { data, isLoading } = useWhiteboard()
  const save = useSaveWhiteboard()
  // Null until you type: the server value shows through, and once you take over
  // the draft wins. Derived rather than synced by an effect, so a refetch can
  // never yank the cursor mid-sentence.
  const [draft, setDraft] = useState<string | null>(null)
  const [saved, setSaved] = useState(true)
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const text = draft ?? data?.content ?? ""

  const onChange = (next: string) => {
    setDraft(next)
    setSaved(false)
    if (timer.current) clearTimeout(timer.current)
    timer.current = setTimeout(() => {
      save.mutate(next, { onSuccess: () => setSaved(true) })
    }, SAVE_DEBOUNCE_MS)
  }

  return (
    <div className="space-y-3">
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
        <span className="shrink-0 text-xs text-slate-400">
          {isLoading ? "Loading…" : saved ? "Saved" : "Saving…"}
        </span>
      </div>

      <Card className="p-3">
        <AutoTextarea
          value={text}
          onChange={(e) => onChange(e.target.value)}
          placeholder="Scratch…"
          className="min-h-[70vh] w-full bg-transparent font-mono text-sm outline-none"
        />
      </Card>
    </div>
  )
}
