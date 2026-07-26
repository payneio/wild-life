import { useState } from "react"
import { RefName } from "@/components/cells"
import { events, routineInstances, routines } from "@/services/api/hooks"
import type {
  Allergy,
  Condition,
  Entity,
  InsurancePlan,
  Medication,
} from "@/services/api/types"
import { Heatmap, Section, Timeline, type TimelineItem } from "@/components/detail/kit"
import { LogDoseModal } from "@/components/LogDoseModal"
import { cn } from "@/lib/utils"
import { dayLabel, formatInstant, humanize, localDay } from "@/lib/format"
import { formatPhone } from "@/lib/phone"

// --- Condition: a care timeline -------------------------------------------
// Medications / Protocols / Metrics / Goals / Health-events are now rendered by
// the generic RelatedPanel (condition.relations); this adds the dated timeline.
export function ConditionDetail({ entity }: { entity: Entity }) {
  const c = entity as Condition
  const evts = events.useList({ entity_type: "condition", entity_id: c.id }).data ?? []

  const timeline: TimelineItem[] = []
  for (const e of evts)
    timeline.push({
      key: `e${e.id}`,
      date: e.start_at ? e.start_at.slice(0, 10) : null,
      title: e.title,
      meta: e.event_type ? humanize(e.event_type) : "",
      to: `/calendar/${e.id}`,
      tone: "accent",
    })
  if (c.onset_date) timeline.push({ key: "onset", date: c.onset_date, title: "Onset" })
  if (c.resolved_date)
    timeline.push({ key: "resolved", date: c.resolved_date, title: "Resolved", tone: "good" })
  timeline.sort((a, b) => (b.date ?? "").localeCompare(a.date ?? ""))

  if (timeline.length === 0) return null

  return (
    <Section title="Care timeline">
      <Timeline items={timeline} />
    </Section>
  )
}

export function MedicationDetail({ entity }: { entity: Entity }) {
  const m = entity as Medication
  const { data } = routines.useList({ medication_id__eq: m.id, limit: "200" })
  const removeInstance = routineInstances.useRemove()
  const [logging, setLogging] = useState(false)
  const lines = data ?? []
  // The dose routine an intake attaches to, if any (pre-fills the log dialog).
  const primaryDose = lines[0]
  // The distinct protocols that schedule this medication.
  const protocolIds = [
    ...new Set(lines.filter((l) => l.protocol_id).map((l) => l.protocol_id as string)),
  ]

  // Adherence: merge completed instances across all of this med's dose routines
  // (standing + via-protocol) into one consistency map. One list call via __in.
  // Scheduled check-offs only (ad_hoc doses don't count toward scheduled adherence).
  const doseIds = lines.map((l) => l.id)
  const instances =
    routineInstances.useList({
      routine_id__in: doseIds.join(","),
      status__eq: "done",
      ad_hoc__eq: "false",
      limit: "500",
    }).data ?? []

  // Denominator for partial shading: the distinct dose-slots this med expects on
  // a scheduled day (PRN doses aren't scheduled; a slotless dose counts as one).
  const expected = new Set<string>()
  for (const r of lines) {
    for (const s of r.timing?.length ? r.timing : [""]) expected.add(s)
  }
  const need = expected.size

  // Distinct slots taken per day → shade by the fraction of the day's doses done.
  const doneByDay = new Map<string, Set<string>>()
  for (const i of instances) {
    const raw = i.completed_at ?? i.scheduled_date
    if (!raw) continue
    const day = localDay(raw)
    const slots = doneByDay.get(day) ?? new Set<string>()
    slots.add(i.slot ?? "")
    doneByDay.set(day, slots)
  }
  const levels = new Map<string, number>()
  for (const [day, slots] of doneByDay) {
    const frac = need ? Math.min(1, slots.size / need) : 1
    levels.set(day, frac >= 1 ? 3 : frac >= 0.5 ? 2 : 1)
  }

  // Dose history: every intake of this medication (prescribed + un-prescribed),
  // newest first — a log of what was taken and when, distinct from the adherence grid.
  const history =
    routineInstances.useList({
      medication_id__eq: m.id,
      status__eq: "done",
      sort: "-completed_at",
      limit: "40",
    }).data ?? []
  const historyItems: TimelineItem[] = history.map((i) => ({
    key: i.id,
    date: i.completed_at ?? i.scheduled_date,
    tone: i.ad_hoc ? "accent" : "good",
    title:
      i.amount != null ? `${i.amount}${i.unit ? ` ${i.unit}` : ""}` : "Taken",
    meta: (
      <span className="flex flex-wrap items-center gap-x-1.5">
        <span>
          {i.completed_at
            ? formatInstant(i.completed_at, { year: undefined })
            : dayLabel(i.scheduled_date)}
        </span>
        {i.slot && <span className="text-slate-400">· {i.slot}</span>}
        {i.ad_hoc && <span className="text-indigo-500">· extra</span>}
        {i.notes && <span className="text-slate-400">· {i.notes}</span>}
        <button
          className="ml-1 text-slate-300 hover:text-red-600"
          title="Delete this dose"
          onClick={() => removeInstance.mutate(i.id)}
        >
          delete
        </button>
      </span>
    ),
  }))


  return (
    <div className="space-y-4">
      <div>
        <div className="mb-1.5 flex items-center justify-between">
          <h3 className="text-xs font-semibold uppercase tracking-wide text-slate-400">
            Protocols
          </h3>
          <button
            className="text-xs font-medium text-indigo-600 hover:underline"
            onClick={() => setLogging(true)}
          >
            Log a dose
          </button>
        </div>
        {protocolIds.length === 0 ? (
          <p className="text-sm text-slate-400">
            Not part of any protocol. Add it as a step in a protocol to schedule it, or log
            ad-hoc doses.
          </p>
        ) : (
          <div className="flex flex-wrap gap-1.5">
            {protocolIds.map((pid) => (
              <RefName key={pid} kind="protocol" id={pid} />
            ))}
          </div>
        )}
      </div>

      {doseIds.length > 0 && (
        <Section title="Adherence · last 13 weeks">
          <Heatmap levels={levels} />
        </Section>
      )}

      {historyItems.length > 0 && (
        <Section title="Dose history">
          <Timeline items={historyItems} />
        </Section>
      )}

      {logging && (
        <LogDoseModal
          medicationId={m.id}
          routineId={primaryDose?.id ?? null}
          label={m.name}
          defaultAmount={primaryDose?.amount ?? null}
          defaultUnit={primaryDose?.unit ?? null}
          onClose={() => setLogging(false)}
        />
      )}
    </div>
  )
}

// --- Insurance: a member card -----------------------------------------------
function CardField({ label, value }: { label: string; value: string | null }) {
  if (!value) return null
  return (
    <div>
      <div className="text-[10px] font-medium uppercase tracking-wider text-slate-400">
        {label}
      </div>
      <div className="font-mono text-sm text-slate-800">{value}</div>
    </div>
  )
}

export function InsuranceDetail({ entity }: { entity: Entity }) {
  const p = entity as InsurancePlan
  return (
    <div className="space-y-3">
      <div className="rounded-2xl border border-slate-200 bg-surface-2 p-4">
        <div className="flex items-start justify-between gap-2">
          <CardField label="Member ID" value={p.member_id} />
          <CardField label="Group" value={p.group_number} />
        </div>
        {(p.rx_bin || p.rx_pcn || p.rx_group) && (
          <div className="mt-4 grid grid-cols-3 gap-2 border-t border-slate-200 pt-3">
            <CardField label="RX BIN" value={p.rx_bin} />
            <CardField label="RX PCN" value={p.rx_pcn} />
            <CardField label="RX Group" value={p.rx_group} />
          </div>
        )}
        {p.network && <div className="mt-3 text-xs text-slate-500">Network: {p.network}</div>}
      </div>
      {p.phone && (
        <a
          href={`tel:${p.phone}`}
          className="inline-flex items-center gap-1.5 text-sm font-medium text-indigo-600 hover:underline"
        >
          Call {formatPhone(p.phone)}
        </a>
      )}
    </div>
  )
}

// --- Allergy: severity-forward ----------------------------------------------
const SEVERITY_TONE: Record<string, string> = {
  severe: "border-red-400 bg-red-50 text-red-700",
  moderate: "border-amber-400 bg-amber-50 text-amber-700",
  mild: "border-slate-300 bg-slate-50 text-slate-600",
}

export function AllergyDetail({ entity }: { entity: Entity }) {
  const a = entity as Allergy
  if (!a.severity && !a.reaction) return null
  const tone = SEVERITY_TONE[(a.severity ?? "").toLowerCase()] ?? SEVERITY_TONE.mild
  return (
    <div className={cn("rounded-xl border-l-4 px-4 py-3", tone)}>
      {a.severity && (
        <div className="text-sm font-semibold capitalize">{a.severity} reaction</div>
      )}
      {a.reaction && <p className="mt-0.5 text-sm text-slate-700">{a.reaction}</p>}
    </div>
  )
}
