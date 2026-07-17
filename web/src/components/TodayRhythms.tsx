import { useQueryClient } from "@tanstack/react-query"
import { Check } from "lucide-react"
import { Card } from "@/components/ui/primitives"
import { apiClient } from "@/services/api/client"
import {
  medicationDoses,
  medications,
  routineInstances,
  routines,
} from "@/services/api/hooks"
import { cn } from "@/lib/utils"

const SLOT_ORDER = [
  "wake",
  "breakfast",
  "morning",
  "lunch",
  "afternoon",
  "dinner",
  "evening",
  "bedtime",
]
const slotRank = (s: string) => {
  const i = SLOT_ORDER.indexOf(s)
  return i === -1 ? 99 : i
}

function today(): string {
  const d = new Date()
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`
}

function CheckRow({
  label,
  sub,
  done,
  onToggle,
}: {
  label: string
  sub?: string
  done: boolean
  onToggle: () => void
}) {
  return (
    <button
      onClick={onToggle}
      className="flex w-full items-center gap-2.5 rounded-lg px-2 py-1.5 text-left hover:bg-slate-100"
    >
      <span
        className={cn(
          "flex h-5 w-5 shrink-0 items-center justify-center rounded-md border",
          done ? "border-indigo-600 bg-indigo-600 text-on-accent" : "border-slate-300",
        )}
      >
        {done && <Check size={13} />}
      </span>
      <span className={cn("text-sm", done ? "text-slate-400 line-through" : "text-slate-700")}>
        {label}
        {sub && <span className="ml-1.5 text-xs text-slate-400">{sub}</span>}
      </span>
    </button>
  )
}

export function TodayRhythms() {
  const qc = useQueryClient()
  const d = today()

  const medQ = medications.useList({ status__eq: "active", limit: "100" })
  const doseQ = medicationDoses.useList({ dose_date__eq: d, limit: "200" })
  const routineQ = routines.useList({ status__eq: "active", limit: "100" })
  const instQ = routineInstances.useList({
    scheduled_date__eq: d,
    status__eq: "done",
    limit: "100",
  })

  const doseCreate = medicationDoses.useCreate()
  const doseRemove = medicationDoses.useRemove()
  const instRemove = routineInstances.useRemove()

  const doseByKey = new Map((doseQ.data ?? []).map((x) => [`${x.medication_id}:${x.slot}`, x]))
  const instByRoutine = new Map((instQ.data ?? []).map((x) => [x.routine_id, x]))

  const meds = medQ.data ?? []
  const doses = meds
    .flatMap((m) => m.schedule.map((s) => ({ med: m, slot: s.slot })))
    .sort((a, b) => slotRank(a.slot) - slotRank(b.slot))
  const activeRoutines = routineQ.data ?? []

  if (doses.length === 0 && activeRoutines.length === 0) return null

  const toggleDose = (medId: string, slot: string) => {
    const existing = doseByKey.get(`${medId}:${slot}`)
    if (existing) doseRemove.mutate(existing.id)
    else
      doseCreate.mutate({
        medication_id: medId,
        dose_date: d,
        slot,
        taken_at: new Date().toISOString(),
      })
  }
  const toggleRoutine = async (routineId: string) => {
    const existing = instByRoutine.get(routineId)
    if (existing) {
      instRemove.mutate(existing.id)
    } else {
      await apiClient.post(`/routines/${routineId}/complete`)
      qc.invalidateQueries({ queryKey: ["routine-instances"] })
    }
  }

  return (
    <Card className="p-4">
      <div className="mb-2 text-sm font-semibold text-slate-700">Today's rhythms</div>
      {doses.length > 0 && (
        <div className="mb-3">
          <div className="mb-1 text-[11px] font-semibold uppercase tracking-wide text-slate-400">
            Medications
          </div>
          {doses.map(({ med, slot }) => (
            <CheckRow
              key={`${med.id}:${slot}`}
              label={med.name}
              sub={`@ ${slot}`}
              done={doseByKey.has(`${med.id}:${slot}`)}
              onToggle={() => toggleDose(med.id, slot)}
            />
          ))}
        </div>
      )}
      {activeRoutines.length > 0 && (
        <div>
          <div className="mb-1 text-[11px] font-semibold uppercase tracking-wide text-slate-400">
            Routines
          </div>
          {activeRoutines.map((r) => (
            <CheckRow
              key={r.id}
              label={r.name}
              done={instByRoutine.has(r.id)}
              onToggle={() => toggleRoutine(r.id)}
            />
          ))}
        </div>
      )}
    </Card>
  )
}
