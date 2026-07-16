import { StatusBadge } from "@/components/cells"
import { healthEvents, medications, protocols } from "@/services/api/hooks"
import type {
  Condition,
  Entity,
  Medication,
} from "@/services/api/types"
import { RelatedRow, Section, Timeline, type TimelineItem } from "@/components/detail/kit"
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
