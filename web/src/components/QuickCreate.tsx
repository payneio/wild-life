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
 *
 * **It is a `<form>`, and that is load-bearing.** Phone keyboards with
 * autocorrect on (GBoard, iOS) deliver the return key as a composition keydown —
 * `key: "Unidentified"`, `keyCode: 229` — not as `key: "Enter"`. A commit hung
 * only off a keydown test therefore never fired on a phone, and since capture
 * had no button either, there was no way at all to finish one: you typed the
 * name, pressed return, and the app did nothing. Native form submission is what
 * the keyboard's Go/return key drives, so that is what commits; the keydown
 * handler stays for desktop and pre-empts the implicit submit so nothing
 * double-fires.
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

  const ready = text.trim().length > 0

  return (
    <div className={cn("flex items-center gap-2", className)}>
      {/* `extra` stays outside the form: it holds other people's buttons (a
          person picker, say), and a stray button inside a form submits it. */}
      <form
        className="relative flex-1"
        onSubmit={(e) => {
          e.preventDefault()
          commit()
        }}
      >
        <Plus
          size={15}
          className="pointer-events-none absolute top-1/2 left-2.5 -translate-y-1/2 text-slate-400"
        />
        <input
          ref={ref}
          value={text}
          placeholder={placeholder}
          disabled={disabled}
          enterKeyHint="done"
          onChange={(e) => setText(e.target.value)}
          onKeyDown={(e) => {
            // Mid-composition Enter belongs to the IME (it's picking a
            // candidate), never to us.
            if (e.nativeEvent.isComposing) return
            if (e.key === "Enter") {
              e.preventDefault()
              commit()
            } else if (e.key === "Escape") {
              setText("")
            }
          }}
          className={cn(
            "w-full rounded-lg border border-slate-200 bg-surface py-1.5 pl-8 text-sm outline-none transition placeholder:text-slate-400 hover:border-slate-300 focus:border-indigo-500 focus:ring-2 focus:ring-indigo-500/20 disabled:opacity-50",
            ready ? "pr-14" : "pr-3",
          )}
        />
        {/* Appears only with text to commit — on a touch device it's the visible
            way to finish, and it makes the form's submit explicit. */}
        {ready && (
          <button
            type="submit"
            disabled={disabled}
            className="absolute top-1/2 right-1.5 -translate-y-1/2 rounded-md px-2 py-1 text-xs font-medium text-indigo-600 transition hover:bg-indigo-50 disabled:opacity-50"
          >
            Add
          </button>
        )}
      </form>
      {extra}
    </div>
  )
}
