import { useState, type ReactNode } from "react"
import { AffiliationsEditor } from "@/components/AffiliationsEditor"
import { RefName } from "@/components/cells"
import { Segmented } from "@/components/detail/kit"
import { SubRecord } from "@/components/record/Record"
import { useFields } from "@/components/record/context"
import { recordFields } from "@/components/record/typed"
import { SLOTS, WEEKDAYS } from "@/lib/slots"
import { Button, EmptyState, Input } from "@/components/ui/primitives"
import { formatDate } from "@/lib/utils"
import { todayISO } from "@/lib/format"
import { metricEntries, routines, useMetricEntries } from "@/services/api/hooks"
import type {
  Entity,
  Metric,
  MetricEntry,
  Protocol,
  Routine,
} from "@/services/api/types"

const R = recordFields<Routine>()

function ExtraSection({ title, children }: { title: string; children: ReactNode }) {
  return (
    <div>
      <h3 className="mb-1.5 text-xs font-semibold uppercase tracking-wide text-slate-400">
        {title}
      </h3>
      {children}
    </div>
  )
}

// Area's child collections (programs/projects/goals/routines/metrics) are now
// rendered by the generic RelatedPanel from `area.relations` — navigable and
// with inline add/create — so AreaExtra is gone.

function Sparkline({ entries }: { entries: MetricEntry[] }) {
  if (entries.length < 2) return null
  const sorted = [...entries].sort((a, b) => a.entry_date.localeCompare(b.entry_date))
  const vals = sorted.map((e) => e.value)
  const min = Math.min(...vals)
  const max = Math.max(...vals)
  const span = max - min || 1
  const w = 240
  const h = 40
  const pts = sorted
    .map((e, i) => {
      const x = (i / (sorted.length - 1)) * w
      const y = h - ((e.value - min) / span) * h
      return `${x.toFixed(1)},${y.toFixed(1)}`
    })
    .join(" ")
  return (
    <svg width={w} height={h} className="text-indigo-500">
      <polyline points={pts} fill="none" stroke="currentColor" strokeWidth={1.5} />
    </svg>
  )
}

export function MetricExtra({ entity }: { entity: Entity }) {
  const metric = entity as Metric
  const { data } = useMetricEntries(metric.id)
  const create = metricEntries.useCreate()
  const [value, setValue] = useState("")
  const [date, setDate] = useState("")
  const list = data ?? []
  const recent = [...list].sort((a, b) => b.entry_date.localeCompare(a.entry_date))
  return (
    <div className="space-y-3">
      <ExtraSection title="Trend">
        {list.length < 2 ? <p className="text-sm text-slate-400">Need ≥2 entries.</p> : <Sparkline entries={list} />}
      </ExtraSection>
      <div className="flex gap-2">
        <Input type="date" value={date} onChange={(e) => setDate(e.target.value)} />
        <Input
          type="number"
          placeholder={metric.unit ?? "value"}
          value={value}
          onChange={(e) => setValue(e.target.value)}
        />
        <Button
          variant="secondary"
          onClick={() => {
            if (value) {
              create.mutate({
                metric_id: metric.id,
                value: Number(value),
                entry_date: date || todayISO(),
              })
              setValue("")
              setDate("")
            }
          }}
        >
          Add
        </Button>
      </div>
      <ExtraSection title={`Entries (${list.length})`}>
        {list.length === 0 ? (
          <p className="text-sm text-slate-400">No entries yet.</p>
        ) : (
          <ul className="max-h-48 space-y-1 overflow-y-auto text-sm">
            {recent.map((e) => (
              <li key={e.id} className="flex justify-between border-b border-slate-50 py-1">
                <span>{formatDate(e.entry_date)}</span>
                <span className="font-medium">
                  {e.value}
                  {metric.unit ? ` ${metric.unit}` : ""}
                </span>
              </li>
            ))}
          </ul>
        )}
      </ExtraSection>
    </div>
  )
}

// --- Protocol: dosed + behavioral steps -------------------------------------
// A step is *either* a medication (a cataloged drug/OTC/supplement you track and
// can check off) *or* an activity (a behavior like "walk after dinner"). The
// toggle picks one so you never fill both.

// One-line "when" summary for a routine: times of day + cadence.
function stepMeta(it: Routine): string {
  const parts: string[] = []
  if (it.timing?.length) parts.push(`@ ${it.timing.join(", ")}`)
  if (it.days_of_week?.length)
    parts.push(it.days_of_week.map((d) => d[0].toUpperCase() + d.slice(1)).join("/"))
  else if (it.interval_days > 1) parts.push(`every ${it.interval_days} days`)
  return parts.join(" · ")
}

export function ProtocolExtra({ entity }: { entity: Entity }) {
  const protocol = entity as Protocol
  const { data } = routines.useList({
    protocol_id__eq: protocol.id,
    sort: "sort_order",
    limit: "200",
  })
  const create = routines.useCreate()
  const remove = routines.useRemove()
  const [open, setOpen] = useState<string | null>(null)
  const list = data ?? []

  // Modeless, like everywhere else: adding a step creates the row immediately
  // (RoutineCreate needs only protocol_id) and opens it for editing, instead of
  // collecting a draft in a modal behind a Save button.
  function add(kind: "medication" | "activity") {
    create.mutate(
      {
        protocol_id: protocol.id,
        sort_order: list.length,
        interval_days: 1,
        ...(kind === "activity" ? { activity: "New step" } : {}),
      },
      { onSuccess: (row: Routine) => setOpen(row.id) },
    )
  }

  return (
    <ExtraSection title={`Steps (${list.length})`}>
      <div className="space-y-3">
        {list.length === 0 ? (
          <EmptyState>No steps yet.</EmptyState>
        ) : (
          <ul className="space-y-1 text-sm">
            {list.map((it) => (
              <StepRow
                key={it.id}
                step={it}
                open={open === it.id}
                onToggle={() => setOpen(open === it.id ? null : it.id)}
                onDelete={() => {
                  if (open === it.id) setOpen(null)
                  remove.mutate(it.id)
                }}
              />
            ))}
          </ul>
        )}
        <div className="flex gap-2">
          <Button variant="secondary" onClick={() => add("medication")}>
            Add dose
          </Button>
          <Button variant="secondary" onClick={() => add("activity")}>
            Add activity
          </Button>
        </div>
      </div>
    </ExtraSection>
  )
}

/** One step: a summary line that expands into inline, autosaving fields. */
function StepRow({
  step,
  open,
  onToggle,
  onDelete,
}: {
  step: Routine
  open: boolean
  onToggle: () => void
  onDelete: () => void
}) {
  const isDose = step.medication_id != null
  return (
    <li className="border-b border-slate-50 py-1.5">
      <div className="flex items-start justify-between gap-2">
        <button
          type="button"
          onClick={onToggle}
          className="flex-1 text-left"
          aria-expanded={open}
        >
          {isDose ? (
            <span className="font-medium">
              <RefName kind="medication" id={step.medication_id} />
            </span>
          ) : step.activity ? (
            <span className="font-medium">{step.activity}</span>
          ) : (
            <span className="font-medium text-slate-400">(step)</span>
          )}
          {step.amount != null ? (
            <span className="text-slate-400">
              {" "}
              · {step.amount}
              {step.unit ? ` ${step.unit}` : ""}
            </span>
          ) : null}
          {stepMeta(step) ? <span className="text-slate-500"> {stepMeta(step)}</span> : null}
        </button>
        <button
          className="shrink-0 rounded px-1 text-xs text-slate-400 hover:text-red-600"
          onClick={onDelete}
        >
          delete
        </button>
      </div>
      {open && (
        <SubRecord crud={routines} entity={step}>
          <div className="mt-2 grid grid-cols-1 gap-x-6 gap-y-3 rounded-lg bg-surface-2 p-3 sm:grid-cols-2">
            <StepKind />
            {isDose ? (
              <>
                <R.Ref field="medication_id" label="Medication" lookup="medication" />
                <R.Number field="amount" label="Amount" placeholder="500" />
                <R.Text field="unit" label="Unit" placeholder="mg" />
              </>
            ) : (
              <R.Text field="activity" label="Activity" full placeholder="e.g. Walk after dinner" />
            )}
            <R.MultiSelect field="timing" label="Times of day" options={SLOTS} />
            <R.MultiSelect field="days_of_week" label="Days (blank = every day)" options={WEEKDAYS} />
            <R.Number field="interval_days" label="Every N days" placeholder="1" />
            <R.Textarea field="notes" label="Notes" minRows={2} />
          </div>
        </SubRecord>
      )}
    </li>
  )
}

/**
 * A step is a dose or an activity, never both. Switching writes both columns at
 * once so the pair can't land half-applied — the invariant the old modal kept by
 * clearing the other field on submit.
 */
function StepKind() {
  const { row, save } = useFields(["medication_id", "activity"])
  const isDose = row.medication_id != null
  return (
    <div className="sm:col-span-2">
      <Segmented
        options={[
          { value: "dose", label: "Dose" },
          { value: "activity", label: "Activity" },
        ]}
        value={isDose ? "dose" : "activity"}
        onChange={(v) =>
          save(
            v === "dose"
              ? { activity: null }
              : { medication_id: null, amount: null, unit: null },
          )
        }
      />
    </div>
  )
}
// --- Organization: members --------------------------------------------------
export function OrganizationExtra({ entity }: { entity: Entity }) {
  return (
    <ExtraSection title="Members">
      <AffiliationsEditor organizationId={entity.id} />
    </ExtraSection>
  )
}
