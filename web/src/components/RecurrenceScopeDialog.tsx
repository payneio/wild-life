import { useState } from "react"
import { Button, Modal } from "@/components/ui/primitives"
import type { RecurrenceScope } from "@/services/calendar/recurrence"

const OPTIONS: { value: RecurrenceScope; label: string; hint: string }[] = [
  { value: "this", label: "This event", hint: "Only this occurrence" },
  { value: "following", label: "This and following", hint: "This and all later occurrences" },
  { value: "all", label: "All events", hint: "The whole series" },
]

/** Google-Calendar-style scope chooser for editing/deleting a recurring event. */
export function RecurrenceScopeDialog({
  title,
  confirmLabel = "OK",
  danger = false,
  onChoose,
  onCancel,
}: {
  title: string
  confirmLabel?: string
  danger?: boolean
  onChoose: (scope: RecurrenceScope) => void
  onCancel: () => void
}) {
  const [scope, setScope] = useState<RecurrenceScope>("this")
  return (
    <Modal title={title} onClose={onCancel}>
      <div className="space-y-1">
        {OPTIONS.map((o) => (
          <label
            key={o.value}
            className="flex cursor-pointer items-start gap-3 rounded-lg px-3 py-2.5 hover:bg-slate-100"
          >
            <input
              type="radio"
              name="recurrence-scope"
              className="mt-1"
              checked={scope === o.value}
              onChange={() => setScope(o.value)}
            />
            <span>
              <span className="block text-sm font-medium text-slate-800">{o.label}</span>
              <span className="block text-xs text-slate-500">{o.hint}</span>
            </span>
          </label>
        ))}
      </div>
      <div className="mt-4 flex justify-end gap-2">
        <Button variant="secondary" onClick={onCancel}>
          Cancel
        </Button>
        <Button variant={danger ? "danger" : "primary"} onClick={() => onChoose(scope)}>
          {confirmLabel}
        </Button>
      </div>
    </Modal>
  )
}
