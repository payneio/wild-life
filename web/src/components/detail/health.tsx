import { StatusBadge } from "@/components/cells"
import { healthEvents, medications, protocols } from "@/services/api/hooks"
import type {
  Allergy,
  Condition,
  Entity,
  HealthEvent,
  InsurancePlan,
  Medication,
} from "@/services/api/types"
import { DaysBadge, RelatedRow, Section, Timeline, type TimelineItem } from "@/components/detail/kit"
import { cn } from "@/lib/utils"
import { humanize } from "@/lib/format"

// --- Condition: a care record with a timeline -------------------------------
export function ConditionDetail({ entity }: { entity: Entity }) {
  const c = entity as Condition
  const meds = (medications.useList().data ?? []).filter((m) => m.condition_id === c.id)
  const events = (healthEvents.useList().data ?? []).filter((e) => e.condition_id === c.id)
  const protos = (protocols.useList().data ?? []).filter((p) => p.condition_id === c.id)

  const timeline: TimelineItem[] = []
  for (const e of events)
    timeline.push({
      key: `e${e.id}`,
      date: e.occurred_on,
      title: e.title,
      meta: humanize(e.event_type),
      to: `/health-events/${e.id}`,
      tone: "accent",
    })
  for (const m of meds)
    if (m.start_date)
      timeline.push({
        key: `m${m.id}`,
        date: m.start_date,
        title: `Started ${m.name}`,
        meta: humanize(m.status),
        to: `/medications/${m.id}`,
        tone: "good",
      })
  if (c.onset_date) timeline.push({ key: "onset", date: c.onset_date, title: "Onset" })
  if (c.resolved_date)
    timeline.push({ key: "resolved", date: c.resolved_date, title: "Resolved", tone: "good" })
  timeline.sort((a, b) => (b.date ?? "").localeCompare(a.date ?? ""))

  const hasRelated = meds.length > 0 || protos.length > 0 || timeline.length > 0
  if (!hasRelated) return null

  return (
    <div className="space-y-5">
      {meds.length > 0 && (
        <Section title={`Medications · ${meds.length}`}>
          <div className="space-y-1.5">
            {meds.map((m) => (
              <RelatedRow
                key={m.id}
                to={`/medications/${m.id}`}
                title={m.name}
                badge={<StatusBadge status={m.status} />}
                meta={m.strength ?? undefined}
              />
            ))}
          </div>
        </Section>
      )}

      {protos.length > 0 && (
        <Section title={`Protocols · ${protos.length}`}>
          <div className="space-y-1.5">
            {protos.map((p) => (
              <RelatedRow
                key={p.id}
                to={`/protocols/${p.id}`}
                title={p.name}
                badge={<StatusBadge status={p.status} />}
              />
            ))}
          </div>
        </Section>
      )}

      {timeline.length > 0 && (
        <Section title="Care timeline">
          <Timeline items={timeline} />
        </Section>
      )}
    </div>
  )
}

// --- Medication: a dose card ------------------------------------------------
function SlotChip({ slot, amount }: { slot: string; amount: string | null }) {
  return (
    <span className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 bg-surface px-2.5 py-1.5 text-xs">
      <span className="font-medium capitalize text-slate-700">{slot}</span>
      {amount && <span className="text-slate-400">{amount}</span>}
    </span>
  )
}

export function MedicationDetail({ entity }: { entity: Entity }) {
  const m = entity as Medication
  const headline = m.strength || m.dose || null
  return (
    <div className="rounded-xl border border-slate-200 bg-surface-2 p-4">
      <div className="flex flex-wrap items-baseline gap-x-2 gap-y-1">
        {headline ? (
          <span className="text-lg font-semibold text-slate-900">{headline}</span>
        ) : (
          <span className="text-sm text-slate-400">No dose recorded</span>
        )}
        {m.strength && m.dose && <span className="text-sm text-slate-500">· {m.dose}</span>}
        {m.form && <span className="text-sm text-slate-500">{m.form}</span>}
      </div>
      {m.schedule?.length > 0 && (
        <div className="mt-3 flex flex-wrap gap-2">
          {m.schedule.map((s, i) => (
            <SlotChip key={i} slot={s.slot} amount={s.amount} />
          ))}
        </div>
      )}
    </div>
  )
}

// --- Health event: a clinical note ------------------------------------------
export function HealthEventDetail({ entity }: { entity: Entity }) {
  const e = entity as HealthEvent
  if (!e.follow_up && !e.follow_up_date) return null
  return (
    <div className="rounded-xl border-l-4 border-amber-400 bg-amber-50 px-4 py-3">
      <div className="flex items-center gap-2">
        <span className="text-[11px] font-semibold uppercase tracking-wide text-amber-700">
          Follow-up
        </span>
        {e.follow_up_date && <DaysBadge date={e.follow_up_date} />}
      </div>
      {e.follow_up && (
        <p className="mt-1 whitespace-pre-wrap text-sm text-slate-700">{e.follow_up}</p>
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
          Call {p.phone}
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
