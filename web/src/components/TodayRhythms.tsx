import { useState } from "react"
import { Check, Plus } from "lucide-react"
import { Link } from "react-router-dom"
import { Card } from "@/components/ui/primitives"
import { LogDoseModalFor, type DoseTarget } from "@/components/LogDoseModal"
import {
  routineInstances,
  useCompleteRoutine,
  useRegimen,
  useUncompleteRoutine,
} from "@/services/api/hooks"
import { cn } from "@/lib/utils"
import { ymd } from "@/lib/format"
import { slotRank } from "@/lib/slots"
import type { RegimenEntry } from "@/services/api/types"

const rowLabel = (e: RegimenEntry): string =>
  e.amount != null ? `${e.label} · ${e.amount}${e.unit ? ` ${e.unit}` : ""}` : e.label

const rowSub = (e: RegimenEntry): string | undefined => {
  const parts: string[] = []
  if (e.slot) parts.push(`@ ${e.slot}`)
  if (e.source_protocol_name) parts.push(e.source_protocol_name)
  return parts.join(" · ") || undefined
}

function CheckRow({
  label,
  sub,
  done,
  to,
  onToggle,
  onLogDose,
}: {
  label: string
  sub?: string
  done: boolean
  to: string
  onToggle: () => void
  onLogDose?: () => void
}) {
  // The checkbox toggles the scheduled completion; the label opens the routine's
  // detail; the trailing "+" logs an extra/ad-hoc dose (see LogDoseModal).
  return (
    <div className="group flex w-full items-center gap-2.5 rounded-lg px-2 py-1.5 hover:bg-slate-100">
      <button
        onClick={onToggle}
        title={done ? "Mark not done" : "Mark done"}
        className={cn(
          "flex h-5 w-5 shrink-0 items-center justify-center rounded-md border",
          done ? "border-indigo-600 bg-indigo-600 text-on-accent" : "border-slate-300",
        )}
      >
        {done && <Check size={13} />}
      </button>
      <Link
        to={to}
        className={cn(
          "min-w-0 flex-1 text-sm",
          done ? "text-slate-400 line-through" : "text-slate-700",
        )}
      >
        {label}
        {sub && <span className="ml-1.5 text-xs text-slate-400">{sub}</span>}
      </Link>
      {onLogDose && (
        <button
          onClick={onLogDose}
          title="Log an extra dose"
          className="shrink-0 rounded-md p-1 text-slate-400 opacity-0 transition hover:bg-slate-200 hover:text-slate-700 focus:opacity-100 group-hover:opacity-100"
        >
          <Plus size={14} />
        </button>
      )}
    </div>
  )
}

export function TodayRhythms() {
  const d = ymd()
  const regimenQ = useRegimen(d)
  const instQ = routineInstances.useList({
    scheduled_date__eq: d,
    status__eq: "done",
    ad_hoc__eq: "false", // only scheduled check-offs flip the checkbox
    limit: "300",
  })
  const complete = useCompleteRoutine()
  const uncomplete = useUncompleteRoutine()
  const [doseTarget, setDoseTarget] = useState<DoseTarget | null>(null)

  // The server derives what's due today (cadence + protocol/med liveness), so
  // there's nothing to filter here — just render and toggle.
  const doneByKey = new Set((instQ.data ?? []).map((x) => `${x.routine_id}:${x.slot}`))
  const entries = [...(regimenQ.data ?? [])].sort((a, b) => slotRank(a.slot) - slotRank(b.slot))
  if (entries.length === 0) return null

  const toggle = (e: RegimenEntry) => {
    const vars = { id: e.routine_id, on: d, slot: e.slot }
    if (doneByKey.has(`${e.routine_id}:${e.slot}`)) uncomplete.mutate(vars)
    else complete.mutate(vars)
  }

  const openDose = (e: RegimenEntry) => {
    if (!e.medication_id) return
    setDoseTarget({
      medicationId: e.medication_id,
      routineId: e.routine_id,
      label: e.label,
      defaultAmount: e.amount,
      defaultUnit: e.unit,
      defaultSlot: e.slot,
    })
  }

  const section = (title: string, items: RegimenEntry[], canLog: boolean) =>
    items.length > 0 ? (
      <div className="mb-3 last:mb-0">
        <div className="mb-1 text-[11px] font-semibold uppercase tracking-wide text-slate-400">
          {title}
        </div>
        {items.map((e) => (
          <CheckRow
            key={`${e.routine_id}:${e.slot}`}
            label={rowLabel(e)}
            sub={rowSub(e)}
            done={doneByKey.has(`${e.routine_id}:${e.slot}`)}
            to={e.medication_id ? `/medications/${e.medication_id}` : `/routines/${e.routine_id}`}
            onToggle={() => toggle(e)}
            onLogDose={canLog && e.medication_id ? () => openDose(e) : undefined}
          />
        ))}
      </div>
    ) : null

  const meds = entries.filter((e) => e.kind === "medication" || e.kind === "supplement")
  const rest = entries.filter((e) => e.kind === "activity" || e.kind === "routine")

  return (
    <Card className="p-4">
      <div className="mb-2 text-sm font-semibold text-slate-700">Today's rhythms</div>
      {section("Medications", meds, true)}
      {section("Routines", rest, false)}
      <LogDoseModalFor target={doseTarget} onClose={() => setDoseTarget(null)} />
    </Card>
  )
}
