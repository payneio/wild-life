import { useRef, useState, type ReactNode } from "react"
import { Plus } from "lucide-react"
import { cn } from "@/lib/utils"

/**
 * One-line capture.
 *
 * Creation here is capture, not form-filling: you have a thought and want it
 * recorded with no friction. Everything past the name is refinement, and
 * refinement belongs in the detail where it's grouped properly — not in a modal
 * that asks seventeen questions to record "renew the passport".
 *
 * Nothing is created until you commit non-empty text, and the new row lands in
 * the list you're already looking at, so a mistake is visible and deletable in
 * place rather than becoming an orphan.
 *
 * By default the field keeps focus after committing, so you can capture a run of
 * items without touching the mouse. Pass `onCreated` to leave instead — right
 * for objects you'll immediately elaborate (a delegation's dates, a review's
 * findings), wrong for a list you're filling.
 */
export function QuickCreate({
  placeholder,
  onCreate,
  extra,
  disabled,
  className,
}: {
  placeholder: string
  /** Commit. Return false to keep the text (e.g. a required companion field is empty). */
  onCreate: (title: string) => boolean | void
  /** A companion control for the one relationship the object can't do without. */
  extra?: ReactNode
  disabled?: boolean
  className?: string
}) {
  const [text, setText] = useState("")
  const ref = useRef<HTMLInputElement>(null)

  function commit() {
    const title = text.trim()
    if (!title) return
    if (onCreate(title) === false) return
    setText("")
    ref.current?.focus()
  }

  return (
    <div className={cn("flex items-center gap-2", className)}>
      <div className="relative flex-1">
        <Plus
          size={15}
          className="pointer-events-none absolute top-1/2 left-2.5 -translate-y-1/2 text-slate-400"
        />
        <input
          ref={ref}
          value={text}
          placeholder={placeholder}
          disabled={disabled}
          onChange={(e) => setText(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              e.preventDefault()
              commit()
            } else if (e.key === "Escape") {
              setText("")
            }
          }}
          className="w-full rounded-lg border border-slate-200 bg-surface py-1.5 pr-3 pl-8 text-sm outline-none transition placeholder:text-slate-400 hover:border-slate-300 focus:border-indigo-500 focus:ring-2 focus:ring-indigo-500/20 disabled:opacity-50"
        />
      </div>
      {extra}
    </div>
  )
}
