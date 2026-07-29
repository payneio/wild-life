import { useState, type ReactNode } from "react"
import { Check } from "lucide-react"
import {
  Button,
  Field,
  Input,
  Modal,
  Select,
  Stepper,
  Textarea,
} from "@/components/ui/primitives"
import { DetailDrawer } from "@/components/DetailDrawer"
import { routineInstances, useLogDose } from "@/services/api/hooks"
import { dayOf, instantToLocalInput, localInputToInstant, nowInstant } from "@/lib/date"
import { SLOTS } from "@/lib/slots"
import { cn } from "@/lib/utils"
import { showActionToast } from "@/lib/toast"

// Common multiples of the prescribed dose, for one-tap adjustment (e.g. took a half).
const MULTIPLES: [string, number][] = [
  ["½×", 0.5],
  ["1×", 1],
  ["2×", 2],
]
const approxEq = (a: number | null, b: number) =>
  a != null && Math.abs(a - b) < 1e-6

/**
 * Log an intake — a taking event. Always names a medication; a routine (when the
 * intake fulfils a prescription) pre-fills the dose (amount + unit). Handles the
 * common check-off-style extra dose, a PRN dose, a backdated dose, a deviation
 * (different amount), and an un-prescribed one-off (no routine). On save the
 * created intake is offered back as an Undo.
 *
 * Centered Modal on desktop, full-screen DetailDrawer on mobile.
 */
export function LogDoseModal({
  medicationId,
  routineId,
  label,
  defaultAmount,
  defaultUnit,
  defaultSlot = "",
  onClose,
}: {
  medicationId: string
  routineId?: string | null
  label: string
  defaultAmount: number | null
  defaultUnit?: string | null
  defaultSlot?: string
  onClose: () => void
}) {
  const logDose = useLogDose()
  const remove = routineInstances.useRemove()
  const [amount, setAmount] = useState<number | null>(defaultAmount)
  const [unit, setUnit] = useState(defaultUnit ?? "")
  const [when, setWhen] = useState(instantToLocalInput(nowInstant()))
  const [slot, setSlot] = useState(defaultSlot)
  const [context, setContext] = useState("")

  const save = () => {
    const taken = localInputToInstant(when) ?? nowInstant()
    logDose.mutate(
      {
        medication_id: medicationId,
        routine_id: routineId ?? null,
        amount,
        unit: unit.trim() || null,
        slot,
        scheduled_date: dayOf(taken),
        completed_at: taken,
        context: context.trim() || null,
      },
      {
        onSuccess: (inst) => {
          showActionToast(`Logged ${label}`, {
            label: "Undo",
            onClick: () => remove.mutate(inst.id),
          })
          onClose()
        },
      },
    )
  }

  const body = (
    <div className="space-y-4">
      <div className="flex flex-col gap-1 text-sm">
        <span className="font-medium text-slate-600">Dose taken</span>
        <div className="flex items-start gap-2">
          <div className="flex-1">
            <Stepper value={amount} onChange={setAmount} unit={unit || null} autoFocus />
          </div>
          <Input
            className="w-24"
            value={unit}
            onChange={(e) => setUnit(e.target.value)}
            placeholder="mg"
            aria-label="Unit"
          />
        </div>
        {defaultAmount != null && (
          <div className="mt-1.5 flex flex-wrap gap-1.5">
            {MULTIPLES.map(([mlabel, mult]) => {
              const v = Math.round(defaultAmount * mult * 1000) / 1000
              return (
                <button
                  key={mlabel}
                  type="button"
                  onClick={() => setAmount(v)}
                  className={cn(
                    "rounded-full px-2.5 py-1 text-xs font-medium transition",
                    approxEq(amount, v)
                      ? "bg-indigo-600 text-on-accent"
                      : "bg-slate-100 text-slate-600 hover:bg-slate-200",
                  )}
                >
                  {mlabel} · {v}
                </button>
              )
            })}
          </div>
        )}
      </div>
      <Field label="When">
        <Input
          type="datetime-local"
          value={when}
          onChange={(e) => setWhen(e.target.value)}
        />
      </Field>
      <Field label="Time of day (optional)">
        <Select value={slot} onChange={(e) => setSlot(e.target.value)}>
          <option value="">—</option>
          {SLOTS.map((s) => (
            <option key={s} value={s}>
              {s}
            </option>
          ))}
        </Select>
      </Field>
      {/* Named for the question it answers — why this intake went the way it
          did — which is the column it writes (`routine_instances.context`). It
          was labelled "Note" and posted a `notes` key the API stopped having
          when the notes columns were retired, so pydantic dropped it and every
          word typed here was lost. */}
      <Field label="How it went (optional)">
        <Textarea
          value={context}
          onChange={(e) => setContext(e.target.value)}
          placeholder="e.g. felt nauseous, took with food"
        />
      </Field>
      <div className="flex justify-end gap-2 pt-1">
        <Button variant="secondary" onClick={onClose}>
          Cancel
        </Button>
        <Button onClick={save} disabled={logDose.isPending}>
          <Check size={16} /> Log dose
        </Button>
      </div>
    </div>
  )

  const title = `Log a dose · ${label}`
  return (
    <>
      <div className="hidden lg:block">
        <Modal title={title} onClose={onClose}>
          {body}
        </Modal>
      </div>
      <div className="lg:hidden">
        <DetailDrawer title={title} onClose={onClose}>
          {body}
        </DetailDrawer>
      </div>
    </>
  )
}

/** A minimal identity for opening the dose modal from a list row. */
export type DoseTarget = {
  medicationId: string
  routineId?: string | null
  label: string
  defaultAmount: number | null
  defaultUnit?: string | null
  defaultSlot?: string
}

/** Convenience wrapper: render nothing when no target, else the modal. */
export function LogDoseModalFor({
  target,
  onClose,
}: {
  target: DoseTarget | null
  onClose: () => void
}): ReactNode {
  if (!target) return null
  return (
    <LogDoseModal
      medicationId={target.medicationId}
      routineId={target.routineId}
      label={target.label}
      defaultAmount={target.defaultAmount}
      defaultUnit={target.defaultUnit}
      defaultSlot={target.defaultSlot}
      onClose={onClose}
    />
  )
}
