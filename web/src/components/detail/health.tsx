import { useState } from "react"
import { RefName } from "@/components/cells"
import { EntityForm } from "@/components/EntityForm"
import { STANDING_DOSE_FIELDS } from "@/services/api/fields"
import { events, medications, routines } from "@/services/api/hooks"
import type { Body } from "@/services/api/crud"
import type {
  Allergy,
  Condition,
  Entity,
  InsurancePlan,
  Medication,
  Routine,
} from "@/services/api/types"
import { Section, Timeline, type TimelineItem } from "@/components/detail/kit"
import { cn } from "@/lib/utils"
import { humanize } from "@/lib/format"

// --- Condition: a care timeline -------------------------------------------
// Medications / Protocols / Metrics / Goals / Health-events are now rendered by
// the generic RelatedPanel (condition.relations); this adds the dated timeline.
export function ConditionDetail({ entity }: { entity: Entity }) {
  const c = entity as Condition
  const meds = (medications.useList().data ?? []).filter((m) => m.condition_id === c.id)
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

  if (timeline.length === 0) return null

  return (
    <Section title="Care timeline">
      <Timeline items={timeline} />
    </Section>
  )
}

// --- Medication: a dose card ------------------------------------------------
function SlotChip({ slot, amount }: { slot: string; amount: number | null }) {
  return (
    <span className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 bg-surface px-2.5 py-1.5 text-xs">
      <span className="font-medium capitalize text-slate-700">{slot}</span>
      {amount != null && <span className="text-slate-400">{amount}</span>}
    </span>
  )
}

// The cadence part of a dose routine (days-of-week / every-N-days / PRN); null = daily.
function cadenceLabel(it: Routine): string | null {
  if (it.as_needed) return "PRN"
  if (it.days_of_week?.length)
    return it.days_of_week.map((d) => d[0].toUpperCase() + d.slice(1)).join("/")
  if (it.interval_days > 1) return `every ${it.interval_days} days`
  return null
}

export function MedicationDetail({ entity }: { entity: Entity }) {
  const m = entity as Medication
  const { data } = routines.useList({ medication_id__eq: m.id, limit: "200" })
  const create = routines.useCreate()
  const update = routines.useUpdate()
  const remove = routines.useRemove()
  const [editing, setEditing] = useState<Routine | null>(null)
  const [adding, setAdding] = useState(false)
  const lines = data ?? []
  const headline = m.strength || null

  function submit(body: Body) {
    // A standing dose belongs to this med, no protocol; daily unless set.
    const patch = { ...body, interval_days: (body.interval_days as number) || 1 }
    if (editing) update.mutate({ id: editing.id, body: patch })
    else create.mutate({ ...patch, medication_id: m.id, protocol_id: null })
    setEditing(null)
    setAdding(false)
  }

  return (
    <div className="space-y-4">
      <div className="rounded-xl border border-slate-200 bg-surface-2 p-4">
        <div className="flex flex-wrap items-baseline gap-x-2 gap-y-1">
          {headline ? (
            <span className="text-lg font-semibold text-slate-900">{headline}</span>
          ) : (
            <span className="text-sm text-slate-400">No strength recorded</span>
          )}
          {m.form && <span className="text-sm text-slate-500">{m.form}</span>}
        </div>
      </div>

      <div>
        <div className="mb-1.5 flex items-center justify-between">
          <h3 className="text-xs font-semibold uppercase tracking-wide text-slate-400">Doses</h3>
          {!adding && !editing && (
            <button
              className="text-xs font-medium text-indigo-600 hover:underline"
              onClick={() => setAdding(true)}
            >
              + standing dose
            </button>
          )}
        </div>
        {lines.length === 0 && !adding ? (
          <p className="text-sm text-slate-400">No doses yet.</p>
        ) : (
          <ul className="space-y-1.5">
            {lines.map((it) => {
              const standing = it.protocol_id == null
              return (
                <li
                  key={it.id}
                  className="flex items-start justify-between gap-2 rounded-lg border border-slate-100 px-2.5 py-1.5"
                >
                  <div className="flex flex-wrap items-center gap-1.5">
                    {(it.timing ?? []).map((slot) => (
                      <SlotChip key={slot} slot={slot} amount={it.amount} />
                    ))}
                    {cadenceLabel(it) && (
                      <span className="text-xs text-slate-500">{cadenceLabel(it)}</span>
                    )}
                    <span className="text-xs text-slate-400">
                      {standing ? (
                        "standing"
                      ) : (
                        <>
                          via <RefName kind="protocol" id={it.protocol_id!} />
                        </>
                      )}
                    </span>
                  </div>
                  {standing && (
                    <div className="whitespace-nowrap">
                      <button
                        className="rounded px-1 text-xs text-slate-400 hover:text-slate-700"
                        onClick={() => {
                          setEditing(it)
                          setAdding(false)
                        }}
                      >
                        edit
                      </button>
                      <button
                        className="rounded px-1 text-xs text-slate-400 hover:text-red-600"
                        onClick={() => remove.mutate(it.id)}
                      >
                        delete
                      </button>
                    </div>
                  )}
                </li>
              )
            })}
          </ul>
        )}
        {(adding || editing) && (
          <div className="mt-2">
            <EntityForm
              key={editing?.id ?? "new"}
              fields={STANDING_DOSE_FIELDS}
              initial={editing ?? undefined}
              onSubmit={submit}
              onCancel={() => {
                setEditing(null)
                setAdding(false)
              }}
              submitLabel={editing ? "Save" : "Add dose"}
            />
          </div>
        )}
      </div>
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
