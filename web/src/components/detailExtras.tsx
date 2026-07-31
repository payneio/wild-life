import { useState, type ReactNode } from "react"
import { AffiliationsEditor } from "@/components/AffiliationsEditor"
import { RefName } from "@/components/cells"
import { Segmented, Sparkline } from "@/components/detail/kit"
import { SubRecord } from "@/components/record/Record"
import { useFields } from "@/components/record/context"
import { recordFields } from "@/components/record/typed"
import { SLOTS, WEEKDAYS } from "@/lib/slots"
import { Button, EmptyState, Input } from "@/components/ui/primitives"
import {
  compareInstants,
  dayLabel,
  formatClock,
  instantToLocalInput,
  localInputToInstant,
  nowInstant,
} from "@/lib/date"
import {
  metricEntries,
  routines,
  useMetricEntries,
  useMetricSeries,
} from "@/services/api/hooks"
import type {
  Entity,
  Metric,
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

// Area's child collections (programs/projects/outcomes/routines/metrics) are now
// rendered by the generic RelatedPanel from `area.relations` — navigable and
// with inline add/create — so AreaExtra is gone.

export function MetricExtra({ entity }: { entity: Entity }) {
  const metric = entity as Metric
  const derived = metric.source === "derived"
  const { data } = useMetricEntries(metric.id)
  const series = useMetricSeries(metric.id).data ?? []
  const create = metricEntries.useCreate()
  const [value, setValue] = useState("")
  // Capture already knows *when* — you're recording a reading you just took — so
  // "when" is prefilled with now and only touched to back-date one. Blank is not
  // a state worth having; it just means today, which is what now already says.
  const [when, setWhen] = useState(() => instantToLocalInput(nowInstant()))
  const list = data ?? []
  const recent = [...list].sort((a, b) => compareInstants(b.recorded_at, a.recorded_at))

  const add = () => {
    if (!value.trim()) return
    create.mutate({
      metric_id: metric.id,
      value: Number(value),
      recorded_at: localInputToInstant(when) ?? nowInstant(),
    })
    setValue("")
    setWhen(instantToLocalInput(nowInstant()))
  }

  return (
    <div className="space-y-3">
      <ExtraSection title="Trend">
        {series.length < 2 ? (
          <p className="text-sm text-slate-400">
            {derived ? "Not enough history to plot yet." : "Need ≥2 entries."}
          </p>
        ) : (
          <Sparkline entries={series} />
        )}
      </ExtraSection>

      {/* A derived metric has nothing to log — it reads itself. Showing a
          disabled entry box would suggest otherwise. */}
      {derived ? (
        <p className="text-sm text-slate-500">
          Computed from your own data, on every read. Nothing to enter.
        </p>
      ) : (
        <>
      <div className="flex gap-2">
        <Input
          type="datetime-local"
          value={when}
          onChange={(e) => setWhen(e.target.value)}
          className="w-auto"
        />
        <Input
          type="number"
          placeholder={metric.unit ?? "value"}
          value={value}
          onChange={(e) => setValue(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") add()
          }}
        />
        <Button variant="secondary" onClick={add}>
          Add
        </Button>
      </div>
      <ExtraSection title={`Entries (${list.length})`}>
        {list.length === 0 ? (
          <p className="text-sm text-slate-400">No entries yet.</p>
        ) : (
          <ul className="max-h-48 space-y-1 overflow-y-auto text-sm">
            {recent.map((e) => (
              <li key={e.id} className="flex justify-between gap-3 border-b border-slate-50 py-1">
                <span className="flex min-w-0 gap-2">
                  <span className="truncate">{dayLabel(e.recorded_at)}</span>
                  {/* The whole point of storing an instant: several readings a
                      day are only distinguishable by their time. */}
                  <span className="shrink-0 text-slate-400">{formatClock(e.recorded_at)}</span>
                </span>
                <span className="shrink-0 font-medium">
                  {e.value}
                  {metric.unit ? ` ${metric.unit}` : ""}
                </span>
              </li>
            ))}
          </ul>
        )}
      </ExtraSection>
        </>
      )}
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
  //
  // One button rather than one per kind. The row opens with the Dose/Activity
  // toggle as its first control, so choosing the kind here would ask the same
  // question twice, one line apart — and the kind determines nothing at creation
  // (unlike a review's type, which computes its period). The per-kind buttons
  // also had to seed a column to record the choice, so "Add activity" wrote the
  // literal "New step" into `activity`: fabricated content in a real column,
  // indistinguishable in the list from a name the user typed.
  function add() {
    create.mutate(
      { protocol_id: protocol.id, sort_order: list.length, interval_days: 1 },
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
          <Button variant="secondary" onClick={add}>
            Add step
          </Button>
        </div>
      </div>
    </ExtraSection>
  )
}

type StepKindValue = "dose" | "activity"

/**
 * What a step *is*: naming a medication makes it a dose, prose makes it an
 * activity — the model's own rule (`regimen._kind` server-side).
 *
 * A step you just added names neither, and that gap is what jammed the Dose /
 * Activity toggle: kind was read straight off `medication_id`, so choosing
 * "Dose" — which only clears `activity` — left the answer unchanged and the
 * toggle sat where it was. Worse, "Add dose" creates a row with nothing set, so
 * it opened claiming to be an activity and couldn't be told otherwise. Hence the
 * `intent` tiebreak: the data decides whenever it can (so a filled-in step can
 * never be rendered as the other kind, which would hide it), and only an empty
 * step defers to what you last pressed.
 */
function stepKind(step: Routine, intent: StepKindValue): StepKindValue {
  if (step.medication_id != null) return "dose"
  if (step.name != null) return "activity"
  return intent
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
  const [intent, setIntent] = useState<StepKindValue>(() =>
    step.name != null ? "activity" : "dose",
  )
  const kind = stepKind(step, intent)
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
          ) : step.name ? (
            <span className="font-medium">{step.name}</span>
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
            <StepKind value={kind} onChange={setIntent} />
            {kind === "dose" ? (
              <>
                <R.Ref field="medication_id" label="Medication" lookup="medication" />
                <R.Number field="amount" label="Amount" placeholder="500" />
                <R.Text field="unit" label="Unit" placeholder="mg" />
              </>
            ) : (
              <R.Text field="name" label="Name" full placeholder="e.g. Walk after dinner" />
            )}
            <R.MultiSelect field="timing" label="Times of day" options={SLOTS} />
            <R.MultiSelect field="days_of_week" label="Days (blank = every day)" options={WEEKDAYS} />
            <R.Number field="interval_days" label="Every N days" placeholder="1" />
            <R.Textarea field="rationale" label="Why / prescribed by" minRows={2} />
          </div>
        </SubRecord>
      )}
    </li>
  )
}

/**
 * A step is a dose or an activity, never both. Switching writes the other kind's
 * columns away in one call so the pair can't land half-applied — the invariant
 * the old modal kept by clearing the other field on submit.
 *
 * `value` is decided by the row (see `stepKind`); the toggle reports the choice
 * back up because an empty step has no column to record it in yet. `useFields`
 * still declares both columns, so this control owns them for coverage.
 */
function StepKind({
  value,
  onChange,
}: {
  value: StepKindValue
  onChange: (v: StepKindValue) => void
}) {
  const { save } = useFields(["medication_id", "activity"])
  return (
    <div className="sm:col-span-2">
      <Segmented
        options={[
          { value: "dose", label: "Dose" },
          { value: "activity", label: "Activity" },
        ]}
        value={value}
        onChange={(v: StepKindValue) => {
          onChange(v)
          save(
            v === "dose"
              ? { name: null }
              : { medication_id: null, amount: null, unit: null },
          )
        }}
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
