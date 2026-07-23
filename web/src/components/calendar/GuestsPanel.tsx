import { useState } from "react"
import { Check, Clock, Mail, Send, X } from "lucide-react"
import { Button, Modal } from "@/components/ui/primitives"
import { Section } from "@/components/detail/kit"
import { useEventGuests, useSendInvites } from "@/services/api/hooks"
import { showActionToast } from "@/lib/toast"
import { cn } from "@/lib/utils"
import type { EventItem, GuestStatus } from "@/services/api/types"

const PARTSTAT_LABEL: Record<string, string> = {
  accepted: "Accepted",
  declined: "Declined",
  tentative: "Maybe",
  "needs-action": "Invited",
}

/** Status pill for one guest — honest about the async pipeline. */
function StatusPill({ g }: { g: GuestStatus }) {
  if (g.partstat && g.partstat !== "needs-action") {
    const tone =
      g.partstat === "accepted"
        ? "bg-emerald-50 text-emerald-700"
        : g.partstat === "declined"
          ? "bg-red-50 text-red-600"
          : "bg-amber-50 text-amber-700"
    return (
      <span className={cn("rounded-full px-2 py-0.5 text-[11px] font-medium", tone)}>
        {PARTSTAT_LABEL[g.partstat] ?? g.partstat}
      </span>
    )
  }
  if (g.invited) {
    return (
      <span className="inline-flex items-center gap-1 rounded-full bg-indigo-50 px-2 py-0.5 text-[11px] font-medium text-indigo-600">
        <Check size={11} /> Invited
      </span>
    )
  }
  return (
    <span className="inline-flex items-center gap-1 rounded-full bg-slate-100 px-2 py-0.5 text-[11px] font-medium text-slate-500">
      <Clock size={11} /> Pending
    </span>
  )
}

/**
 * Guests panel for a hosted event. Shows each guest's invite/RSVP status and a
 * deliberate Send action. Sending is async (a cron/tick delivers), so statuses
 * are shown truthfully — Pending until the ledger records the send, then Invited,
 * then the guest's reply.
 */
export function GuestsPanel({ event }: { event: EventItem }) {
  const guests = useEventGuests(event.id).data ?? []
  const send = useSendInvites()
  const [confirm, setConfirm] = useState(false)

  if (event.attendees.length === 0) return null

  const pending = guests.filter((g) => !g.invited)
  const invited = guests.filter((g) => g.invited)
  const replied = guests.filter((g) => g.partstat && g.partstat !== "needs-action")
  const accepted = replied.filter((g) => g.partstat === "accepted").length

  // What the button offers: first send, or send to new/changed guests.
  const hasUninvited = pending.length > 0
  const label = invited.length === 0 ? "Send invitations" : "Send updates"

  const doSend = () => {
    setConfirm(false)
    send.mutate(event.id, {
      onSuccess: (res) => {
        if (res.disabled) {
          showActionToast("Mail is off — invitations will send once it's enabled")
        } else {
          const n = res.requests_sent + res.cancels_sent
          showActionToast(n > 0 ? `Invitations sending to ${n} guest${n === 1 ? "" : "s"}…` : "Everyone is up to date")
        }
      },
    })
  }

  const summary = [
    invited.length > 0 && `${invited.length} invited`,
    accepted > 0 && `${accepted} accepted`,
    hasUninvited && `${pending.length} pending`,
  ]
    .filter(Boolean)
    .join(" · ")

  return (
    <Section
      title="Guests"
      action={
        <Button
          size="sm"
          variant={hasUninvited ? "primary" : "secondary"}
          disabled={send.isPending}
          onClick={() => setConfirm(true)}
        >
          <Send size={13} /> {send.isPending ? "Sending…" : label}
        </Button>
      }
    >
      {summary && <div className="mb-2 text-xs text-slate-500">{summary}</div>}
      <div className="space-y-1">
        {guests.map((g) => (
          <div
            key={g.email}
            className="flex items-center justify-between gap-2 rounded-lg px-2 py-1.5 text-sm hover:bg-slate-50"
          >
            <div className="flex min-w-0 items-center gap-2">
              <Mail size={14} className="shrink-0 text-slate-300" />
              <span className="truncate text-slate-700">{g.name ?? g.email}</span>
              {g.name && <span className="truncate text-xs text-slate-400">{g.email}</span>}
            </div>
            <StatusPill g={g} />
          </div>
        ))}
      </div>

      {confirm && (
        <Modal title={label} onClose={() => setConfirm(false)}>
          <p className="text-sm text-slate-600">
            {invited.length === 0
              ? `Email an invitation to ${event.attendees.length} guest${event.attendees.length === 1 ? "" : "s"}?`
              : `Send an updated invitation to your guests${hasUninvited ? ` and invite ${pending.length} new one${pending.length === 1 ? "" : "s"}` : ""}?`}
          </p>
          <div className="mt-4 flex justify-end gap-2">
            <Button variant="secondary" onClick={() => setConfirm(false)}>
              <X size={14} /> Not now
            </Button>
            <Button onClick={doSend}>
              <Send size={14} /> {label}
            </Button>
          </div>
        </Modal>
      )}
    </Section>
  )
}
