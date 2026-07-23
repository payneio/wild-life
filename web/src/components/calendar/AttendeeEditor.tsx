import { useMemo, useRef, useState } from "react"
import { UserPlus, X } from "lucide-react"
import { EntityPicker } from "@/components/graph/EntityPicker"
import { Input } from "@/components/ui/primitives"
import { people } from "@/services/api/hooks"
import { cn } from "@/lib/utils"

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

/**
 * Attendee editor: pick existing People (with inline create) AND type raw email
 * addresses. Emits a `string[]` of emails (the immutable-ICS contract the API
 * expects); Person links stay derived server-side by reconcile-attendees. Each
 * chip shows the resolved Person name or the raw email.
 */
export function AttendeeEditor({
  value,
  onChange,
}: {
  value: string[]
  onChange: (next: string[]) => void
}) {
  const peopleData = people.useList().data
  const { nameByEmail, emailById, nameById } = useMemo(() => {
    const list = peopleData ?? []
    const nameByEmail = new Map<string, string>()
    const emailById = new Map<string, string>()
    const nameById = new Map<string, string>()
    for (const p of list) {
      nameById.set(p.id, p.name)
      const email = (p.emails?.[0]?.value ?? "").trim()
      if (email) {
        emailById.set(p.id, email)
        nameByEmail.set(email.toLowerCase(), p.name)
      }
    }
    return { nameByEmail, emailById, nameById }
  }, [peopleData])

  const attendees = value ?? []
  const [text, setText] = useState("")
  const [open, setOpen] = useState(false)
  const [hint, setHint] = useState<string | null>(null)
  const btnRef = useRef<HTMLButtonElement>(null)

  const add = (email: string) => {
    const e = email.trim()
    if (!e) return
    if (attendees.some((a) => a.toLowerCase() === e.toLowerCase())) return
    onChange([...attendees, e])
  }
  const remove = (email: string) =>
    onChange(attendees.filter((a) => a !== email))

  const commitText = () => {
    const e = text.trim()
    if (!e) return
    if (!EMAIL_RE.test(e)) {
      setHint("That doesn't look like an email address.")
      return
    }
    add(e)
    setText("")
    setHint(null)
  }

  return (
    <div className="space-y-2">
      {attendees.length > 0 && (
        <div className="flex flex-wrap gap-1.5">
          {attendees.map((email) => {
            const name = nameByEmail.get(email.toLowerCase())
            return (
              <span
                key={email}
                className="inline-flex items-center gap-1.5 rounded-full border border-slate-200 bg-surface-2 py-1 pl-2.5 pr-1 text-xs text-slate-700"
              >
                <span className="font-medium">{name ?? email}</span>
                {name && <span className="text-slate-400">{email}</span>}
                <button
                  type="button"
                  aria-label={`Remove ${email}`}
                  onClick={() => remove(email)}
                  className="rounded-full p-0.5 text-slate-400 hover:bg-red-50 hover:text-red-600"
                >
                  <X size={13} />
                </button>
              </span>
            )
          })}
        </div>
      )}
      <div className="flex gap-1.5">
        <Input
          value={text}
          placeholder="Add an email address…"
          className="flex-1"
          onChange={(e) => {
            setText(e.target.value)
            setHint(null)
          }}
          onKeyDown={(e) => {
            if (e.key === "Enter" || e.key === ",") {
              e.preventDefault()
              commitText()
            }
          }}
          onBlur={commitText}
        />
        <button
          ref={btnRef}
          type="button"
          title="Add an existing person"
          onClick={() => setOpen(true)}
          className={cn(
            "flex shrink-0 items-center gap-1 rounded-lg border border-slate-300 px-2.5 text-sm text-slate-600 transition hover:border-slate-400 hover:text-slate-900",
          )}
        >
          <UserPlus size={15} /> Person
        </button>
      </div>
      {hint && <div className="text-[11px] text-amber-600">{hint}</div>}
      {open && (
        <EntityPicker
          getAnchor={() => btnRef.current}
          type="person"
          placeholder="Search people…"
          onClose={() => setOpen(false)}
          onSelect={(r) => {
            setOpen(false)
            const email = emailById.get(r.id)
            if (email) {
              add(email)
            } else {
              const name = nameById.get(r.id) ?? r.label
              setHint(`No email on file for ${name} — type one to invite them.`)
            }
          }}
        />
      )}
    </div>
  )
}
